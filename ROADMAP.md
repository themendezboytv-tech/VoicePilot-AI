# Roadmap - VoicePilot AI

Objetivo del proyecto: plataforma SaaS multi-tenant que vende "recepcionistas de IA por voz" a negocios, con proveedores de telefonía e IA intercambiables (sin vendor lock-in).

## Fase 1: Infraestructura y Cimientos
- [x] Definición de la Constitución del Proyecto (`PROJECT_PROMPT.md`).
- [x] Estructuración de directorios y control de versiones inicial.
- [x] Configuración del entorno Docker (PostgreSQL + Redis).
- [x] Elección del stack tecnológico del Backend (Node.js + Express + TypeScript).
- [x] API REST base de Tenants, Assistants y Calls (CRUD).
- [x] Integración inicial de IA (Gemini) con memoria de contexto en Redis.

## Fase 2: Arreglos y Fundamentos Pendientes (🔴 bloquea todo lo demás)
- [ ] Corregir `schema.sql` para que coincida con los campos que usan los controllers (tenants: `slug`, `plan`, `is_active`; assistants: `greeting_message`, `voice_id`, `phone_number`).
- [ ] Añadir campo `ai_provider` y `telephony_provider` por Tenant/Assistant en el schema.

## Fase 3: Capa de Providers Intercambiables (IA y Telefonía)
- [ ] Diseñar interfaz común de IA (`ai-provider.interface.ts`) y mover Gemini a un provider bajo esa interfaz.
- [ ] Añadir provider de OpenAI intercambiable.
- [ ] Diseñar interfaz común de Telefonía (`telephony-provider.interface.ts`).
- [ ] Implementar provider de Twilio (primer proveedor real de telefonía).
- [ ] Conectar el Webhook de telefonía real: llamada entra → voz a texto → IA → texto a voz → responde.
- [ ] Pruebas de latencia en llamadas de voz en tiempo real.

## Fase 4: Backend y Panel SaaS Multiempresa
- [ ] Autenticación de Tenants (login, API keys).
- [ ] Panel web base para que cada empresa configure su asistente (prompt, horarios, número).
- [ ] Planes y límites de uso por Tenant (minutos/llamadas incluidos).

## Fase 5: Monetización
- [ ] Integración de cobro recurrente (Stripe u otro).
- [ ] Definición de planes comerciales (básico/pro/enterprise).
- [ ] Onboarding self-service para que un negocio se dé de alta sin intervención manual.

## Fase 6: Producción y Despliegue
- [ ] Pruebas de estrés y seguridad (RGPD, dado que se manejan datos de llamadas de clientes finales).
- [ ] Despliegue estable en Vps-Casero con monitoreo.