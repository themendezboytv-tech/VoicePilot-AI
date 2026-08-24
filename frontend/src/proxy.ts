// ==============================================================================
// PROXY (antes "middleware", renombrado en Next.js 16 — ver
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
// Chequeo optimista de sesión: NO es la autorización real (esa la hace el
// backend en cada request, ver auth.middleware.ts). Solo evita renderizar
// páginas protegidas sin ninguna cookie de sesión, y evita mostrar
// login/registro a alguien que ya está logueado.
// ==============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/cookie-names";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSession =
    request.cookies.has(ACCESS_TOKEN_COOKIE) || request.cookies.has(REFRESH_TOKEN_COOKIE);

  if (!isPublicPath && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/refresh).*)"],
};
