@AGENTS.md

# CLAUDE.md (admin)

VoicePilot Admin: panel de superadministrador de la plataforma. App separada del panel de cliente (`/frontend`) — mismo stack (Next.js App Router + Tailwind + shadcn/ui), en `/admin` dentro del mismo monorepo. Ver `backend/docs/design-voicepilot-admin.md` para el diseño completo y su razonamiento.

## Separación de auth respecto al panel de cliente

**Esto es lo importante de todo este directorio: un usuario del panel de cliente no puede entrar acá nunca, ni adivinando la URL.** No es solo una pantalla de login distinta:

- Backend: tablas `superadmins`/`superadmin_refresh_tokens` completamente separadas de `users`/`refresh_tokens`. JWT firmado con `ADMIN_JWT_SECRET`, un secreto **distinto** al `JWT_SECRET` del panel de cliente — un token de cliente no puede verificarse nunca contra `requireSuperAdmin`, sin importar sus claims.
- Frontend (acá): cookies con nombres distintos (`va_access_token`/`va_refresh_token`, ver `src/lib/cookie-names.ts`) — no hay forma de que una sesión de cliente y una de admin se pisen, ni siquiera corriendo ambas apps en localhost.
- **Sin registro público.** No existe (ni debe existir) un formulario de alta de superadmin en esta app ni un endpoint `/api/admin/auth/register` en el backend. La única forma de crear un superadmin es `backend/scripts/seed-superadmin.ts`, corrido a mano.

## Comandos

Desde `admin/`: `npm run dev`, `npm run build`, `npm run lint`. Necesita el backend corriendo (`BACKEND_URL` en `.env.local`) y al menos un superadmin sembrado (`npm run seed:superadmin -- --email=... --password=... [--test]` desde `backend/`).

## Páginas

- `/login` — único punto de entrada, sin registro.
- `/tenants` — lista completa de todos los tenants de la plataforma (sin scope de ningún tipo — a diferencia del panel de cliente, acá se ve todo), con estado, plan, y actividad agregada (pedidos/llamadas).
- `/tenants/[id]` — detalle: aprobar (demo→active), suspender/reactivar, marcar demo con fecha de vencimiento, asignar plan (texto libre — no hay estructura de planes decidida todavía, no inventar nombres/precios acá), más usuarios y asistentes del tenant (solo lectura).

## Pendiente, deliberadamente fuera de esta primera versión

- 2FA/TOTP y restricción por IP en el login de admin (anotado en el doc de diseño como mejora futura).
- Ningún enforcement real de `account_status='suspended'` sobre si el asistente de voz/WhatsApp del tenant deja de responder — hoy es solo una etiqueta en la base de datos. Es una decisión de producto pendiente (ver `backend/CLAUDE.md`).
- Estructura y precios de planes.
