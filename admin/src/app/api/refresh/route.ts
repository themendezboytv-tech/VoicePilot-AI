// Renueva la sesión de admin en segundo plano — ver
// frontend/src/app/api/refresh/route.ts para la explicación completa
// (Server Components no pueden escribir cookies, por eso esto es un Route
// Handler separado, llamado por <SessionRefresher/>).
import { NextResponse } from 'next/server';
import { getRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/session';
import { BACKEND_URL } from '@/lib/api';

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = await fetch(`${BACKEND_URL}/api/admin/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  if (!res.ok) {
    await clearSessionCookies();
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await res.json();
  await setSessionCookies(body.accessToken, body.refreshToken);

  return NextResponse.json({ ok: true });
}
