// ==============================================================================
// ROUTE HANDLER: renueva la sesión en segundo plano (llamado por
// <SessionRefresher/> cada ~10 min desde el navegador, ver
// components/session-refresher.tsx). Es el único lugar fuera de las Server
// Actions de login/logout donde escribimos las cookies de sesión — un
// Server Component no puede hacerlo (ver docs de cookies() de Next.js).
// ==============================================================================

import { NextResponse } from "next/server";
import { getRefreshToken, setSessionCookies, clearSessionCookies } from "@/lib/session";
import { BACKEND_URL } from "@/lib/api";

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  if (!res.ok) {
    await clearSessionCookies();
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await res.json();
  await setSessionCookies(body.accessToken, body.refreshToken);

  return NextResponse.json({ ok: true });
}
