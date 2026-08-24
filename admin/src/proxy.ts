// ==============================================================================
// PROXY (Next.js 16 renombró middleware.ts a proxy.ts). Chequeo optimista
// de sesión — la autorización real la hace el backend en cada request
// (requireSuperAdmin, con ADMIN_JWT_SECRET). Ver frontend/src/proxy.ts para
// el mismo patrón en el panel de cliente.
// ==============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/cookie-names';

const PUBLIC_PATHS = ['/login'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSession =
    request.cookies.has(ACCESS_TOKEN_COOKIE) || request.cookies.has(REFRESH_TOKEN_COOKIE);

  if (!isPublicPath && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL('/tenants', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/refresh).*)'],
};
