// ==============================================================================
// CLIENTE API: llamadas server-side al backend de VoicePilot AI.
// Solo se usa desde Server Components, Server Actions y Route Handlers (todo
// lo que corre en el servidor de Next.js) — nunca desde el navegador, así el
// access token nunca sale de una cookie httpOnly.
// ==============================================================================

import "server-only";
import { redirect } from "next/navigation";
import { getAccessToken } from "./session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetch autenticado contra el backend. Ante un 401 (token vencido o
 * inválido) manda directo a /login: el refresh silencioso pasa por
 * app/api/refresh/route.ts (disparado en segundo plano por
 * <SessionRefresher/>, ver components/session-refresher.tsx) — un Server
 * Component no puede escribir cookies, así que acá no se intenta renovar.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    redirect("/login");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Error al comunicarse con el servidor");
  }

  return body as T;
}

export { BACKEND_URL };
