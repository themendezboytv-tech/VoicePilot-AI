// ==============================================================================
// SERVICIO: Autenticación
// Proyecto: VoicePilot AI
// Descripción: Hashing de contraseñas, firma/verificación de JWT de acceso,
// y generación/hash de refresh tokens. Sin dependencias de Express — la capa
// HTTP vive en auth.controller.ts / auth.middleware.ts.
// ==============================================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const BCRYPT_SALT_ROUNDS = 10;

export interface AccessTokenPayload {
  sub: string; // user.id
  tenant_id: string;
  role: string;
  email: string;
}

/**
 * JWT_SECRET es obligatorio: sin él, cualquier token sería falsificable con
 * un secreto por defecto adivinable. Falla rápido al arrancar el server en
 * vez de firmar tokens inseguros en silencio.
 */
function getJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no está configurado. Revisá el archivo .env.');
  }
  return JWT_SECRET;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
}

/**
 * Genera un refresh token opaco (no JWT): 32 bytes random en hex. Devuelve
 * tanto el token en claro (se manda una sola vez al cliente) como su hash
 * SHA-256 (lo único que se guarda en la tabla refresh_tokens).
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashRefreshToken(token), expiresAt };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
