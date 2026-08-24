// ==============================================================================
// SESIÓN: cookies httpOnly para los tokens del backend de VoicePilot AI.
// El backend emite JWT de acceso (15 min) + refresh token opaco (30 días,
// ver backend/src/services/auth.service.ts). Acá solo los guardamos/leemos
// como cookies httpOnly — nunca llegan a JS del navegador.
// ==============================================================================

import "server-only";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./cookie-names";

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };

const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15 minutos, igual que el JWT del backend
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
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

export interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Decodifica el payload del JWT SOLO para mostrar datos en la UI (email,
 * rol). No verifica la firma — no hace falta, porque nunca se usa para
 * decidir autorización: cada llamada real al backend vuelve a validar el
 * token del lado del servidor (ver auth.middleware.ts en el backend).
 */
export async function getSessionUser(): Promise<AccessTokenPayload | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const payloadSegment = token.split(".")[1];
    const json = Buffer.from(payloadSegment, "base64url").toString("utf-8");
    return JSON.parse(json) as AccessTokenPayload;
  } catch {
    return null;
  }
}
