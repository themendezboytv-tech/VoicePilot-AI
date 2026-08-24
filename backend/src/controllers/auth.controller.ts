// ==============================================================================
// CONTROLADOR: Autenticación
// Proyecto: VoicePilot AI
// Descripción: Registro, login, refresh y logout para usuarios del panel de
// cliente. Sin recuperación de contraseña todavía (decisión de producto:
// diferida hasta el primer cliente real, ver CLAUDE.md).
// ==============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken
} from '../services/auth.service';
import { checkRateLimit, registerAttempt, clearRateLimit } from '../services/rate-limit.service';

const MIN_PASSWORD_LENGTH = 8;

// --- Rate limiting de /api/auth/login ---
// Dos contadores independientes, ambos tienen que estar "libres" para dejar
// intentar el login:
//   - Por IP: frena a alguien probando contraseñas contra MUCHAS cuentas
//     distintas desde una sola conexión (credential stuffing).
//   - Por cuenta+IP (no solo por cuenta): frena la fuerza bruta contra UNA
//     cuenta puntual, pero a propósito NO cuenta solo por email — si
//     contara solo por email, cualquiera que conociera el email de un
//     cliente podría fallar el login a propósito una y otra vez y dejarlo
//     bloqueado indefinidamente sin necesitar su contraseña (denegación de
//     servicio contra esa cuenta). Combinando email+IP, un atacante que
//     falla repetidas veces solo se bloquea a sí mismo desde su propia
//     conexión — el cliente real, entrando desde la suya, nunca se ve
//     afectado por lo que haga otra IP.
const LOGIN_IP_LIMIT = 10;
const LOGIN_IP_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_LIMIT = 5;
const LOGIN_ACCOUNT_WINDOW_SECONDS = 15 * 60;

const loginIpKey = (ip: string) => `rl:login:ip:${ip}`;
const loginAccountKey = (email: string, ip: string) => `rl:login:acct:${email.toLowerCase()}:${ip}`;

// --- Rate limiting de /api/auth/register ---
// Un solo contador por IP: no hay "contraseña" que adivinar acá, el
// objetivo es solo evitar que un script cree cuentas demo en cadena desde
// una sola máquina. No frena un ataque distribuido (muchas IPs) — para eso
// hace falta CAPTCHA o verificación de email, deliberadamente diferido.
const REGISTER_IP_LIMIT = 5;
const REGISTER_IP_WINDOW_SECONDS = 60 * 60;

const registerIpKey = (ip: string) => `rl:register:ip:${ip}`;

function tooManyRequests(res: Response, retryAfterSeconds: number, message: string): void {
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({ error: message });
}

/**
 * Genera un slug URL-friendly a partir del nombre del negocio (minúsculas,
 * sin acentos, espacios/símbolos -> guiones). No garantiza unicidad por sí
 * solo — register() reintenta con un sufijo random ante choque (ver abajo).
 */
function slugify(businessName: string): string {
  return businessName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  tenant_is_active: boolean;
}

/**
 * Método: POST /api/auth/register
 * Body: { business_name, email, password }
 * Registro público: crea un tenant nuevo + su primer usuario (role='owner')
 * en una sola transacción. El tenant nace con account_status='demo' — no
 * bloquea nada todavía (ver migrator.ts), es solo el estado que el día de
 * mañana "VoicePilot Admin" va a poder revisar/aprobar manualmente.
 * Devuelve accessToken/refreshToken igual que login(), para que el panel
 * pueda loguear al usuario automáticamente después de registrarse.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const ipKey = registerIpKey(req.ip || 'sin-ip');
  const ipStatus = await checkRateLimit(ipKey, REGISTER_IP_LIMIT);
  if (ipStatus.blocked) {
    tooManyRequests(res, ipStatus.retryAfterSeconds, 'Demasiados registros desde esta conexión. Probá de nuevo más tarde.');
    return;
  }
  // Se cuenta el intento ANTES de procesar (éxito o error), a propósito:
  // el límite es sobre "cuántas veces se llamó a este endpoint", no sobre
  // "cuántos registros fallaron" — no hay nada que adivinar acá.
  await registerAttempt(ipKey, REGISTER_IP_WINDOW_SECONDS);

  const client = await dbPool.connect();

  try {
    const { business_name, email, password } = req.body;

    if (!business_name || !email || !password) {
      res.status(400).json({ error: 'Los campos business_name, email y password son obligatorios' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
      return;
    }

    const baseSlug = slugify(business_name) || 'negocio';
    const passwordHash = await hashPassword(password);

    await client.query('BEGIN');

    // Reintenta el slug con un sufijo random ante choque de unicidad, en vez
    // de exigirle al usuario que piense un identificador único al registrarse.
    let tenantId: string | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3 && !tenantId; attempt++) {
      const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
      try {
        const tenantResult = await client.query(
          `INSERT INTO tenants (name, slug, plan, account_status) VALUES ($1, $2, 'basic', 'demo') RETURNING id`,
          [business_name, candidateSlug]
        );
        tenantId = tenantResult.rows[0].id;
      } catch (error: any) {
        if (error.code === '23505') {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (!tenantId) {
      throw lastError;
    }

    let userId: string;
    try {
      const userResult = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING id`,
        [tenantId, email, passwordHash]
      );
      userId = userResult.rows[0].id;
    } catch (error: any) {
      if (error.code === '23505') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Ese email ya está registrado' });
        return;
      }
      throw error;
    }

    await client.query('COMMIT');

    const accessToken = signAccessToken({ sub: userId, tenant_id: tenantId, role: 'owner', email });
    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await dbPool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: userId, tenant_id: tenantId, email, role: 'owner' }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    respondToDbError(error, res, 'Error interno del servidor al registrar la cuenta');
  } finally {
    client.release();
  }
};

/**
 * Método: POST /api/auth/login
 * Body: { email, password }
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Los campos email y password son obligatorios' });
      return;
    }

    const ip = req.ip || 'sin-ip';
    const ipKey = loginIpKey(ip);
    const accountKey = loginAccountKey(email, ip);

    // Se chequean los DOS límites antes de tocar la base de datos — si
    // cualquiera de los dos ya está tope, ni se molesta en consultar.
    const ipStatus = await checkRateLimit(ipKey, LOGIN_IP_LIMIT);
    if (ipStatus.blocked) {
      tooManyRequests(res, ipStatus.retryAfterSeconds, 'Demasiados intentos de inicio de sesión desde esta conexión. Probá de nuevo en unos minutos.');
      return;
    }

    const accountStatus = await checkRateLimit(accountKey, LOGIN_ACCOUNT_LIMIT);
    if (accountStatus.blocked) {
      tooManyRequests(res, accountStatus.retryAfterSeconds, 'Demasiados intentos fallidos para esta cuenta desde tu conexión. Probá de nuevo en unos minutos.');
      return;
    }

    const result = await dbPool.query<UserRow>(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.is_active,
              t.is_active AS tenant_is_active
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [email]
    );

    // Mismo mensaje genérico tanto si el email no existe como si la
    // contraseña es incorrecta, para no filtrar qué emails están registrados.
    // Además de responder, cuenta como intento fallido para el rate limit.
    const invalidCredentialsResponse = async () => {
      await Promise.all([
        registerAttempt(ipKey, LOGIN_IP_WINDOW_SECONDS),
        registerAttempt(accountKey, LOGIN_ACCOUNT_WINDOW_SECONDS)
      ]);
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
    };

    if (result.rows.length === 0) {
      await invalidCredentialsResponse();
      return;
    }

    const user = result.rows[0];

    if (!user.is_active || !user.tenant_is_active) {
      // No cuenta como intento fallido de contraseña: es un estado de la
      // cuenta, no un intento de adivinar credenciales.
      res.status(403).json({ error: 'La cuenta está desactivada. Contactá al administrador.' });
      return;
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      await invalidCredentialsResponse();
      return;
    }

    // Login correcto: limpia ambos contadores, así un cliente real nunca
    // se va acercando al límite por el solo hecho de usar la app.
    await clearRateLimit(ipKey, accountKey);

    const accessToken = signAccessToken({
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email
    });

    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await dbPool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al iniciar sesión');
  }
};

/**
 * Método: POST /api/auth/refresh
 * Body: { refreshToken }
 * Rota el refresh token en cada uso: el anterior queda revocado y se emite
 * uno nuevo junto con el access token nuevo.
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'El campo refreshToken es obligatorio' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);

    const result = await dbPool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.tenant_id, u.email, u.role, u.is_active,
              t.is_active AS tenant_is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Refresh token inválido' });
      return;
    }

    const row = result.rows[0];

    if (row.revoked_at || new Date(row.expires_at) < new Date()) {
      res.status(401).json({ error: 'Refresh token inválido o expirado' });
      return;
    }

    if (!row.is_active || !row.tenant_is_active) {
      res.status(403).json({ error: 'La cuenta está desactivada. Contactá al administrador.' });
      return;
    }

    // Rotación: se revoca el token usado y se emite uno nuevo, así un
    // refresh token robado solo sirve una vez antes de quedar inútil.
    await dbPool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

    const accessToken = signAccessToken({
      sub: row.user_id,
      tenant_id: row.tenant_id,
      role: row.role,
      email: row.email
    });

    const { token: newRefreshToken, tokenHash: newTokenHash, expiresAt } = generateRefreshToken();
    await dbPool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [row.user_id, newTokenHash, expiresAt]
    );

    res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al renovar la sesión');
  }
};

/**
 * Método: POST /api/auth/logout
 * Body: { refreshToken }
 * Revoca el refresh token para que /refresh deje de aceptarlo. El access
 * token en curso sigue siendo válido hasta que expire solo (máx. 15 min) —
 * no hay revocación de access tokens, es el trade-off ya documentado en
 * auth.middleware.ts.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'El campo refreshToken es obligatorio' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    await dbPool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );

    res.status(200).json({ message: 'Sesión cerrada' });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al cerrar sesión');
  }
};
