// Nombres de cookies compartidos entre session.ts (server-only, usa
// next/headers) y proxy.ts (corre en el runtime de Edge). Separado en su
// propio archivo sin imports de next/headers para que proxy.ts pueda usarlo
// sin arrastrar código server-only al bundle del proxy.
export const ACCESS_TOKEN_COOKIE = "vp_access_token";
export const REFRESH_TOKEN_COOKIE = "vp_refresh_token";
