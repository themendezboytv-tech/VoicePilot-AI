// ==============================================================================
// CONTROLADOR: Autenticación de VoicePilot Admin
// Proyecto: VoicePilot AI
// Descripción: Login, refresh y logout de superadministradores. A propósito
// NO hay registro público — la única forma de crear un superadmin es
// scripts/seed-superadmin.ts, corrido a mano (ver docs/design-voicepilot-admin.md).
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import {
  comparePassword,
  generateRefreshToken,
  hashRefreshToken,
  signAdminAccessToken
} from '../services/admin-auth.service';
import { checkRateLimit, registerAttempt, clearRateLimit } from '../services/rate-limit.service';

// Límites más estrictos que los del panel de cliente: una cuenta de
// superadmin comprometida es control total de la plataforma, no solo de un
// tenant. Mismo criterio de diseño que login de cliente (ver
// auth.controller.ts): el límite por cuenta se combina con la IP, nunca
// solo por email, para que nadie pueda dejar bloqueado al superadmin real
// fallando a propósito desde otro lado.
const LOGIN_IP_LIMIT = 5;
const LOGIN_IP_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_LIMIT = 3;
const LOGIN_ACCOUNT_WINDOW_SECONDS = 15 * 60;

const loginIpKey = (ip: string) => `rl:admin-login:ip:${ip}`;
const loginAccountKey = (email: string, ip: string) => `rl:admin-login:acct:${email.toLowerCase()}:${ip}`;

function tooManyRequests(res: Response, retryAfterSeconds: number, message: string): void {
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({ error: message });
}

interface SuperAdminRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

/**
 * Método: POST /api/admin/auth/login
 * Body: { email, password }
 */
export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Los campos email y password son obligatorios' });
      return;
    }

    const ip = req.ip || 'sin-ip';
    const ipKey = loginIpKey(ip);
    const accountKey = loginAccountKey(email, ip);

    const ipStatus = await checkRateLimit(ipKey, LOGIN_IP_LIMIT);
    if (ipStatus.blocked) {
      tooManyRequests(res, ipStatus.retryAfterSeconds, 'Demasiados intentos de inicio de sesión desde esta conexión.');
      return;
    }

    const accountStatus = await checkRateLimit(accountKey, LOGIN_ACCOUNT_LIMIT);
    if (accountStatus.blocked) {
      tooManyRequests(res, accountStatus.retryAfterSeconds, 'Demasiados intentos fallidos para esta cuenta desde tu conexión.');
      return;
    }

    const result = await dbPool.query<SuperAdminRow>(
      `SELECT id, email, password_hash, is_active FROM superadmins WHERE email = $1`,
      [email]
    );

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

    const admin = result.rows[0];

    if (!admin.is_active) {
      res.status(403).json({ error: 'Esta cuenta de administrador está desactivada' });
      return;
    }

    const passwordMatches = await comparePassword(password, admin.password_hash);
    if (!passwordMatches) {
      await invalidCredentialsResponse();
      return;
    }

    await clearRateLimit(ipKey, accountKey);

    const accessToken = signAdminAccessToken({ sub: admin.id, email: admin.email });
    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await dbPool.query(
      `INSERT INTO superadmin_refresh_tokens (superadmin_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [admin.id, tokenHash, expiresAt]
    );

    res.status(200).json({
      accessToken,
      refreshToken,
      admin: { id: admin.id, email: admin.email }
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al iniciar sesión de administrador');
  }
};

/**
 * Método: POST /api/admin/auth/refresh
 * Body: { refreshToken }
 */
export const adminRefresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'El campo refreshToken es obligatorio' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);

    const result = await dbPool.query(
      `SELECT rt.id, rt.superadmin_id, rt.expires_at, rt.revoked_at, sa.email, sa.is_active
       FROM superadmin_refresh_tokens rt
       JOIN superadmins sa ON sa.id = rt.superadmin_id
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

    if (!row.is_active) {
      res.status(403).json({ error: 'Esta cuenta de administrador está desactivada' });
      return;
    }

    await dbPool.query(`UPDATE superadmin_refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

    const accessToken = signAdminAccessToken({ sub: row.superadmin_id, email: row.email });
    const { token: newRefreshToken, tokenHash: newTokenHash, expiresAt } = generateRefreshToken();
    await dbPool.query(
      `INSERT INTO superadmin_refresh_tokens (superadmin_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [row.superadmin_id, newTokenHash, expiresAt]
    );

    res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al renovar la sesión de administrador');
  }
};

/**
 * Método: POST /api/admin/auth/logout
 * Body: { refreshToken }
 */
export const adminLogout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'El campo refreshToken es obligatorio' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    await dbPool.query(
      `UPDATE superadmin_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );

    res.status(200).json({ message: 'Sesión cerrada' });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al cerrar sesión de administrador');
  }
};
