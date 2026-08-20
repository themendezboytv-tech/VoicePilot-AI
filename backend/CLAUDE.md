# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VoicePilot AI backend: a multi-tenant SaaS engine that will let businesses run an AI-powered voice receptionist. Each Tenant configures its own Assistant (system prompt, greeting, phone number) without touching code. Node.js + Express + TypeScript, PostgreSQL for persistence, Redis for short-term conversation memory.

**Provider-agnostic goal:** the architecture is meant to avoid locking into one telephony provider (Twilio today, Vonage/Plivo/SIP later) or one AI provider (Gemini today, OpenAI later), swappable per Tenant. This abstraction layer does not exist yet — everything currently talks directly to Gemini (`src/services/gemini.service.ts`) and there is no telephony integration at all. `/api/ai/chat` accepts and returns **text**, not call audio.

## Commands

Run from `backend/`:

- `npm run dev` — start with hot reload (`tsx watch src/index.ts`)
- `npm run build` — compile TypeScript to `dist/` (`tsc`)
- `npm start` — run the compiled build (`node dist/index.js`)

There is no lint script and no test suite configured in this repo.

Production deploy (documented in the root `README.md`): `git pull` → `npm install` → `npm run build` → `pm2 restart voicepilot-backend`. The app is run under PM2 as `voicepilot-backend`, with PostgreSQL and Redis in Docker containers named `alpha_database` and `alpha_cache` (see root `docker-compose.yml`).

## Architecture

Layering is a plain Express REST setup: `routes/*.routes.ts` → `controllers/*.controller.ts` → `dbPool` (from `config/database.ts`) and services. There is no ORM — controllers write raw SQL against `pg` directly.

- `src/index.ts` — boots the app: tests DB/Redis connectivity, runs `runMigrations()`, then starts the HTTP server. Routes are mounted at `/api/tenants`, `/api/assistants`, `/api/calls`, `/api/ai`, plus `/health`.
- `src/config/database.ts` / `src/config/redis.ts` — connection pool / client setup. Env vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` for Postgres; `REDIS_HOST`, `REDIS_PORT` for Redis (note: the root `.env.example` uses different names — `DB_USERNAME`/`DB_DATABASE` — for the Docker Compose services; the backend's own `.env` must use `DB_USER`/`DB_NAME` to match `database.ts`).
- `src/database/migrator.ts` — **this is the live schema migration path and the source of truth.** `runMigrations()` runs an inline `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` SQL block automatically on every server boot (called from `index.ts`). Any column a controller depends on must be added here (both in the `CREATE TABLE` and as a matching `ALTER TABLE ADD COLUMN IF NOT EXISTS` patch, so upgrades of already-running databases pick it up too). `src/database/schema.sql` is kept manually in sync with the same columns as documentation of the full intended schema, but it is not executed by anything — there used to be a standalone `initDb.ts`/`npm run db:init` path that ran it directly, but it had drifted out of sync with `migrator.ts` and was removed; `migrator.ts` is the only thing that actually touches the database.
- `src/services/gemini.service.ts` — calls Gemini directly (no provider abstraction yet). `generateAssistantResponse(systemPrompt, userMessage)` tries a hardcoded list of candidate model names in order (`MODELOS_CANDIDATOS`) and returns the first one that succeeds, to tolerate model availability/naming changes on Google's side.
- `src/services/memory.service.ts` — Redis-backed short-term conversation memory, keyed as `chat_history:{assistant_id}:{caller_number}`, capped at ~2000 chars and expiring after `HISTORY_TTL` (1 hour). Note it creates its **own** `redis` client (`createClient` from the `redis` package) independent of `config/redis.ts` (which uses `ioredis`) — two separate Redis connections exist side by side.
- `src/controllers/ai.controller.ts` (`POST /api/ai/chat`) is the orchestration point tying it together: loads the assistant's `system_prompt` from Postgres → fetches Redis history → calls Gemini with history prepended as context → saves the new exchange back to Redis → persists a `calls` row with a synthesized transcript.

## Language and comments

Source comments and console log messages throughout this codebase are written in Spanish (e.g. `// CONTROLADOR: Tenants (Empresas)`, `console.log('✅ [PostgreSQL] Conexión establecida...')`). Match this convention when editing existing files.
