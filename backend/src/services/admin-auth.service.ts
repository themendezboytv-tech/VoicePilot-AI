// ==============================================================================
// SERVICIO: Autenticación de VoicePilot Admin (superadministradores)
// Proyecto: VoicePilot AI
// Descripción: Firma/verifica JWT de acceso de admin con un secreto propio
// (ADMIN_JWT_SECRET), separado del JWT_SECRET del panel de cliente — un
// token de cliente no puede verificarse nunca contra este servicio, sin
// importar qué claims tenga adentro. El hashing de contraseña y de refresh
// token es genérico y se reusa tal cual de auth.service.ts (no hay nada
// específico de "cliente" en esas funciones). Ver docs/design-voicepilot-admin.md.
// ==============================================================================

import jwt from 'jsonwebtoken';

export { hashPassword, comparePassword, generateRefreshToken, hashRefreshToken } from './auth.service';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_ACCESS_TOKEN_TTL = '15m';

export interface AdminAccessTokenPayload {
  sub: string; // superadmin.id
  email: string;
}

function getAdminJwtSecret(): string {
  if (!ADMIN_JWT_SECRET) {
    throw new Error('ADMIN_JWT_SECRET no está configurado. Revisá el archivo .env.');
  }
  return ADMIN_JWT_SECRET;
}

export function signAdminAccessToken(payload: AdminAccessTokenPayload): string {
  return jwt.sign(payload, getAdminJwtSecret(), { expiresIn: ADMIN_ACCESS_TOKEN_TTL });
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  return jwt.verify(token, getAdminJwtSecret()) as AdminAccessTokenPayload;
}
