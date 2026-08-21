# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 Norte del proyecto (no perder de vista)

VoicePilot AI existe para generar ingresos reales como SaaS multi-tenant vendiendo recepcionistas de IA por voz a negocios. Cualquier decisión técnica debe evaluarse contra esto: ¿esto acerca el producto a tener un cliente real pagando, o es complejidad/pulido que puede esperar? Ante la duda entre "hacerlo bien de una vez" y "lo mínimo que funciona y se puede vender", prioriza lo segundo, salvo que el usuario diga explícitamente lo contrario.

Para tareas grandes o ambiguas, releer esta sección antes de proponer un plan.

## What this is

VoicePilot AI backend: a multi-tenant SaaS engine that will let businesses run an AI-powered voice receptionist. Each Tenant configures its own Assistant (system prompt, greeting, phone number) without touching code. Node.js + Express + TypeScript, PostgreSQL for persistence, Redis for short-term conversation memory.

**Provider-agnostic goal:** the architecture avoids locking into one telephony provider (Twilio today, Vonage/Plivo/SIP later) or one AI provider (Gemini/OpenAI today, more later), swappable per Assistant. This now exists as a real abstraction layer under `src/providers/` (see Architecture below), including `X-Twilio-Signature` verification and per-assistant `telephony_provider` resolution on the call site. What's still missing: `/api/ai/chat` (the text channel) works end-to-end in production; the Twilio voice webhook (`/api/telephony/twilio/*`) is implemented and unit-tested in isolation but has never been exercised against a real phone call or a real Twilio account.

## Commands

Run from `backend/`:

- `npm run dev` — start with hot reload (`tsx watch src/index.ts`)
- `npm run build` — compile TypeScript to `dist/` (`tsc`)
- `npm start` — run the compiled build (`node dist/index.js`)

There is no lint script and no test suite configured in this repo.

Production deploy (documented in the root `README.md`): `git pull` → `npm install` → `npm run build` → `pm2 restart voicepilot-backend`. The app is run under PM2 as `voicepilot-backend`, with PostgreSQL and Redis in Docker containers named `alpha_database` and `alpha_cache` (see root `docker-compose.yml`).

## Architecture

Layering is a plain Express REST setup: `routes/*.routes.ts` → `controllers/*.controller.ts` → `dbPool` (from `config/database.ts`) and services. There is no ORM — controllers write raw SQL against `pg` directly.

- `src/index.ts` — boots the app: tests DB/Redis connectivity, runs `runMigrations()`, then starts the HTTP server. Routes are mounted at `/api/tenants`, `/api/assistants`, `/api/calls`, `/api/ai`, `/api/telephony`, plus `/health`. Uses both `express.json()` and `express.urlencoded()` — the latter is required because Twilio (and most telephony providers) POST webhooks as form-urlencoded, not JSON. Also sets `app.set('trust proxy', true)`, required in production (behind a TLS-terminating proxy) so `req.protocol` reports `https` — otherwise the reconstructed URL used for `X-Twilio-Signature` verification would never match what Twilio actually signed.
- `src/config/database.ts` / `src/config/redis.ts` — connection pool / client setup. Env vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` for Postgres; `REDIS_HOST`, `REDIS_PORT` for Redis (note: the root `.env.example` uses different names — `DB_USERNAME`/`DB_DATABASE` — for the Docker Compose services; the backend's own `.env` must use `DB_USER`/`DB_NAME` to match `database.ts`).
- `src/database/migrator.ts` — **this is the live schema migration path and the source of truth.** `runMigrations()` runs an inline `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` SQL block automatically on every server boot (called from `index.ts`). Any column a controller depends on must be added here (both in the `CREATE TABLE` and as a matching `ALTER TABLE ADD COLUMN IF NOT EXISTS` patch, so upgrades of already-running databases pick it up too). `src/database/schema.sql` is kept manually in sync with the same columns as documentation of the full intended schema, but it is not executed by anything — there used to be a standalone `initDb.ts`/`npm run db:init` path that ran it directly, but it had drifted out of sync with `migrator.ts` and was removed; `migrator.ts` is the only thing that actually touches the database.
- `src/providers/ai/` — the AI abstraction. `ai-provider.interface.ts` defines `AIProvider.generateResponse(systemPrompt, userMessage)`. `gemini.provider.ts` and `openai.provider.ts` implement it (Gemini keeps its multi-model fallback list; OpenAI uses `OPENAI_MODEL`, default `gpt-4o-mini`). `index.ts` exports `getAIProvider(name)`, which resolves the provider from the assistant's `ai_provider` DB column and falls back to Gemini for unknown/missing names. There used to be a `src/services/gemini.service.ts` that called Gemini directly — it's gone; `ai.controller.ts` now goes through `getAIProvider(assistant.ai_provider)` instead.
- `src/providers/telephony/` — the telephony abstraction, same shape as the AI one. `telephony-provider.interface.ts` defines four methods: `parseIncomingCall`/`parseSpeechResult` (normalize a provider's webhook payload) and `buildGreetingResponse`/`buildReplyResponse`/`buildHangupResponse` (build a `{ body, contentType }` voice-markup response). `twilio.provider.ts` is the only implementation, built on the `twilio` package's `twiml.VoiceResponse` (Spanish `es-ES` voice, Twilio's built-in speech recognition — no separate STT/TTS service integrated). `index.ts` exports `getTelephonyProvider(name)`, defaulting to Twilio.
- `src/controllers/telephony.controller.ts` + `src/routes/telephony.routes.ts` (`POST /api/telephony/twilio/voice`, `POST /api/telephony/twilio/gather`) — the real-call flow: `/voice` looks up the assistant by `phone_number` (matched against Twilio's `To` field) and returns a greeting + speech-gather TwiML; `/gather` receives the transcribed speech (Twilio's built-in STT), runs it through `getAIProvider`, reuses the *same* Redis session key scheme as the text channel (`{assistant_id}:{caller_number}`) so a caller's history is shared across channels, logs a `calls` row per conversational turn (status `in-progress`, `duration_seconds` 0 — there's no per-call aggregation yet, each turn is its own row, same pattern the text channel already used), and loops back into another gather. Both handlers verify `X-Twilio-Signature` first (`isValidTwilioSignature`, using the `validateRequest` helper from the `twilio` package against `TELEPHONY_AUTH_TOKEN`) and reject with `403` if it's missing/invalid/unconfigured — since this route is registered specifically as Twilio's webhook, the raw payload is always parsed with the Twilio provider (`FALLBACK_PROVIDER_NAME = 'twilio'`), but once the assistant is loaded, response-building switches to `getTelephonyProvider(assistant.telephony_provider)`. Still never exercised against a real Twilio account/phone number, only unit-tested in isolation (TwiML output shape).
- `src/services/memory.service.ts` — Redis-backed short-term conversation memory, keyed as `chat_history:{assistant_id}:{caller_number}`, capped at ~2000 chars and expiring after `HISTORY_TTL` (1 hour). Note it creates its **own** `redis` client (`createClient` from the `redis` package) independent of `config/redis.ts` (which uses `ioredis`) — two separate Redis connections exist side by side. Shared by both `ai.controller.ts` and `telephony.controller.ts`.
- `src/controllers/ai.controller.ts` (`POST /api/ai/chat`, text channel) and `src/controllers/telephony.controller.ts` (voice channel) both follow the same shape: load the assistant → fetch Redis history → call `getAIProvider(assistant.ai_provider)` with history prepended as context → save the new exchange back to Redis → persist a `calls` row with a synthesized transcript.

## Language and comments

Source comments and console log messages throughout this codebase are written in Spanish (e.g. `// CONTROLADOR: Tenants (Empresas)`, `console.log('✅ [PostgreSQL] Conexión establecida...')`). Match this convention when editing existing files.
