// ==============================================================================
// SESIÓN: cookies httpOnly para los tokens de VoicePilot Admin.
// Mismo diseño que el panel de cliente (frontend/src/lib/session.ts), pero
// con nombres de cookie distintos y sin relación con esa app — VoicePilot
// Admin usa un JWT firmado con ADMIN_JWT_SECRET, un secreto distinto al del
// panel de cliente (ver backend/docs/design-voicepilot-admin.md).
// ==============================================================================

import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './cookie-names';

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };

const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15 minutos, igual que el JWT del backend
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setSessionCookies(accessToken: string, refreshToken: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, accessToken, { ...baseCookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE });
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, { ...baseCookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_TOKEN_COOKIE)?.value;
}

export interface AdminAccessTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Decodifica el payload del JWT SOLO para mostrar el email en la UI — no
 * verifica firma, no se usa para autorización (eso lo hace el backend en
 * cada request real).
 */
export async function getSessionAdmin(): Promise<AdminAccessTokenPayload | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const payloadSegment = token.split('.')[1];
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf-8');
    return JSON.parse(json) as AdminAccessTokenPayload;
  } catch {
    return null;
  }
}
