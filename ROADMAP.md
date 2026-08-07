# Roadmap - VoicePilot AI

## Fase 1: Infraestructura y Cimientos (En curso 🏗️)
- [x] Definición de la Constitución del Proyecto (`PROJECT_PROMPT.md`).
- [x] Estructuración de directorios y control de versiones inicial.
- [ ] Configuración del entorno Docker (PostgreSQL + Redis).
- [ ] Elección oficial del stack tecnológico del Backend.

## Fase 2: El Motor de Telefonía e IA (`ai-engine`)
- [ ] Conexión del Webhook de telefonía (Twilio/Vonage).
- [ ] Integración del motor de LLM con manejo de contexto en Redis.
- [ ] Pruebas de latencia en llamadas de voz en tiempo real.

## Fase 3: Backend y Panel SaaS Multiempresa
- [ ] API de autenticación y gestión de tenants (empresas).
- [ ] Panel web base para configuración de horarios y menús.

## Fase 4: Producción y Despliegue
- [ ] Pruebas de estrés y seguridad (RGPD).
- [ ] Despliegue en servidor casero / VPS dedicado.