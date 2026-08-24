@AGENTS.md

# CLAUDE.md (frontend)

Panel de cliente de VoicePilot AI: Next.js (App Router) + Tailwind + shadcn/ui, en `/frontend` dentro del mismo repo que `backend/` (monorepo, no repos separados). Consume la API REST de `backend/` por HTTP — nunca importa código de `backend/src` directamente.

## Comandos

Desde `frontend/`:
- `npm run dev` — servidor de desarrollo (necesita el backend corriendo, ver `BACKEND_URL` en `.env.local`)
- `npm run build` / `npm start` — build de producción
- `npm run lint`

## Next.js 16: esto NO es el Next.js de tu training data

Ver `node_modules/next/dist/docs/` antes de tocar convenciones de archivos — hay cambios respecto a versiones anteriores. Los dos que ya mordieron acá:
- `middleware.ts` está deprecado, ahora es `src/proxy.ts` (export `proxy`, mismo `config.matcher`).
- `cookies()` de `next/headers` es async (`await cookies()`).

## Arquitectura de autenticación

El backend emite JWT de acceso (15 min) + refresh token opaco (30 días) vía `POST /api/auth/{register,login,refresh,logout}` (ver `backend/CLAUDE.md`). Acá:

- `src/lib/session.ts` — guarda/lee ambos tokens en cookies **httpOnly** (`vp_access_token`, `vp_refresh_token`). Nunca llegan a JS del navegador.
- `src/lib/api.ts` — `apiFetch()`, el único cliente HTTP hacia el backend. Se usa solo desde Server Components/Actions/Route Handlers (tiene `import "server-only"`). Adjunta el access token, y ante un 401 hace `redirect('/login')`.
- `src/proxy.ts` — chequeo optimista (¿hay alguna cookie de sesión?) para redirigir sin renderizar. **No es la autorización real** — esa la sigue haciendo el backend en cada request (`requireAuth` + scoping por `tenant_id`).
- `src/app/api/refresh/route.ts` + `src/components/session-refresher.tsx` — un Route Handler es el único lugar (fuera de las Server Actions de login/logout) que puede escribir cookies; un Server Component no puede. `<SessionRefresher/>` (client, montado en el layout del panel) le pega cada 10 min en segundo plano para que la sesión no expire mientras el usuario navega. Si el refresh falla, el próximo `apiFetch` que dé 401 manda a `/login` — no hay reintento silencioso más agresivo que eso.
- `src/lib/session.ts` también expone `getSessionUser()`, que decodifica el JWT **sin verificar firma** — es solo para mostrar email/rol en la UI, nunca para decidir autorización.

## Estado y pendientes conocidos

- **Sin recuperación de contraseña** (`/forgot-password` es un placeholder): el backend no tiene ese endpoint todavía, decisión de producto diferida.
- **"Usuarios con acceso" (Ajustes de cuenta) es de solo lectura**, muestra únicamente al usuario logueado — no hay `GET/POST /api/users` en el backend todavía para invitar gente.
- **Facturación** es un placeholder puro ("Próximamente"), sin ningún backend detrás.
- **`pricing_info`/`business_hours` son JSONB de formato libre** (ver `migrator.ts` del backend) — el editor (`components/key-value-editor.tsx`) es un editor plano de pares clave/valor, no un formulario estructurado por rubro de negocio.
- **El número de teléfono del asistente se muestra pero no se edita desde acá** — asignar/cambiar un número de Twilio no es autoservicio todavía.
- Un tenant tiene como máximo un asistente en la práctica hoy (`/asistente` toma `data[0]`); el backend no impide crear más, pero no hay UI para manejar varios.
