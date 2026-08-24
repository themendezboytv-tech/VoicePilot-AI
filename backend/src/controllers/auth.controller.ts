// ==============================================================================
// CONTROLADOR: Autenticación
// Proyecto: VoicePilot AI
// Descripción: Login, refresh y logout para usuarios del panel de cliente.
// No incluye registro ni recuperación de contraseña todavía — ambos quedan
// pendientes de una decisión de producto sobre el flujo de alta de negocios
// (ver CLAUDE.md, sección de pendientes conocidos).
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import {
  comparePassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken
} from '../services/auth.service';

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
    const invalidCredentialsResponse = () => {
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
    };

    if (result.rows.length === 0) {
      invalidCredentialsResponse();
      return;
    }

    const user = result.rows[0];

    if (!user.is_active || !user.tenant_is_active) {
      res.status(403).json({ error: 'La cuenta está desactivada. Contactá al administrador.' });
      return;
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      invalidCredentialsResponse();
      return;
    }

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
