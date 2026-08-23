-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA TENANTS
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true,
    -- Vertical de negocio (restaurant, barbershop, ...). Metadata para
    -- reportes/onboarding, no bifurca código.
    business_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA ASSISTANTS
CREATE TABLE IF NOT EXISTS assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    system_prompt TEXT,
    greeting_message TEXT,
    voice_id VARCHAR(100) DEFAULT 'default',
    phone_number VARCHAR(50),
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    telephony_provider VARCHAR(50) DEFAULT 'twilio',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA CALLS
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
    caller_number VARCHAR(50),
    call_sid VARCHAR(64),
    duration_seconds INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    transcript TEXT,
    user_message TEXT,
    bot_response TEXT,
    -- Canal que generó esta fila (voice, whatsapp, web_chat...). Antes de
    -- esta columna, tanto el canal de voz como el de texto (/api/ai/chat)
    -- insertaban acá sin ninguna forma de distinguirlos.
    channel VARCHAR(50) NOT NULL DEFAULT 'voice',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA RECORDS
-- Modelo genérico de "resultado de negocio" (pedido, turno, reserva, etc.):
-- una sola tabla física para todos los tipos de negocio. Lo específico de
-- cada vertical vive en `data` (JSONB) en vez de requerir una tabla nueva
-- por tipo de negocio.
CREATE TABLE IF NOT EXISTS records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
    -- Interacción (fila de `calls`) que originó o actualizó este registro.
    -- Nullable a propósito: a futuro un registro podría crearse sin pasar
    -- por una conversación (carga manual, API directa).
    interaction_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    record_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'received',
    -- Canal de origen. Se guarda acá además de en calls.channel porque la
    -- continuidad de un registro debe poder chequearse sin importar el canal
    -- que lo originó (ver regla de continuidad en CLAUDE.md/diseño) y porque
    -- un registro podría no tener interaction_id asociado.
    channel VARCHAR(50) NOT NULL DEFAULT 'voice',
    contact_name VARCHAR(255),
    contact_identifier VARCHAR(255),
    data JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Sin trigger: como el proyecto no usa ORM, cualquier UPDATE sobre
    -- records debe setear updated_at = NOW() explícitamente en el propio SQL.
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_assistants_tenant ON assistants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_assistant ON calls(assistant_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid);
CREATE INDEX IF NOT EXISTS idx_records_tenant ON records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_interaction ON records(interaction_id);
-- Soporta el chequeo de continuidad entre canales: "¿este contacto tiene un
-- registro abierto reciente?" sin filtrar por channel a propósito, para que
-- una conversación de voz pueda continuar un registro abierto por WhatsApp
-- (o viceversa).
CREATE INDEX IF NOT EXISTS idx_records_contact_lookup
    ON records(tenant_id, contact_identifier, status, updated_at DESC);