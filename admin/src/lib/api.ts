// ==============================================================================
// CLIENTE API: llamadas server-side al backend de VoicePilot AI, namespace
// /api/admin/*. Mismo patrón que el panel de cliente — solo se usa desde
// Server Components/Actions/Route Handlers, nunca desde el navegador.
// ==============================================================================

import 'server-only';
import { redirect } from 'next/navigation';
import { getAccessToken } from './session';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'Error al comunicarse con el servidor');
  }

  return body as T;
}

export { BACKEND_URL };
