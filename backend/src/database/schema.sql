-- ==============================================================================
-- ESQUEMA COMPLETO DE BASE DE DATOS: Arquitectura SaaS Multiempresa
-- Proyecto: VoicePilot AI
-- Descripción: Definición de tablas para Empresas, Usuarios, Asistentes de IA y Registro de Llamadas.
-- ==============================================================================

-- 1. Habilitar extensión para generación automática de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- TABLA: tenants (Empresas / Clientes SaaS)
-- Almacena la información de cada negocio que contrata el servicio de IA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,                           -- Nombre comercial de la empresa
    slug VARCHAR(100) NOT NULL UNIQUE,                    -- Identificador único para URLs/subdominios
    plan VARCHAR(50) NOT NULL DEFAULT 'basic',            -- Plan contratado (basic, pro, enterprise)
    is_active BOOLEAN NOT NULL DEFAULT true,              -- Estado de la suscripción
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- TABLA: users (Usuarios del Sistema)
-- Cuentas de acceso asociadas a un Tenant específico
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Pertenencia a la empresa
    email VARCHAR(255) NOT NULL UNIQUE,                   -- Correo de acceso
    password_hash VARCHAR(255) NOT NULL,                  -- Contraseña encriptada
    full_name VARCHAR(255) NOT NULL,                      -- Nombre del usuario
    role VARCHAR(50) NOT NULL DEFAULT 'admin',            -- Rol (superadmin, admin, operator)
    is_active BOOLEAN NOT NULL DEFAULT true,              -- Estado del usuario
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- TABLA: assistants (Asistentes Telefónicos de IA)
-- Configuración de cada bot de voz por empresa (Prompts, voz, webhook, etc.)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Empresa propietaria
    name VARCHAR(255) NOT NULL,                           -- Nombre del asistente (ej. "Recepcionista Virtual")
    system_prompt TEXT NOT NULL,                          -- Instrucciones/Personalidad para la IA
    greeting_message TEXT NOT NULL,                       -- Saludo inicial al contestar la llamada
    voice_id VARCHAR(100) NOT NULL DEFAULT 'default',     -- Identificador de voz TTS (ElevenLabs, OpenAI, etc.)
    phone_number VARCHAR(50),                             -- Número telefónico asignado (Twilio/Vonage)
    is_active BOOLEAN NOT NULL DEFAULT true,              -- Estado del asistente
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- TABLA: call_logs (Registro Histórico de Llamadas)
-- Historial detallado de interacciones de voz procesadas por la IA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
    caller_number VARCHAR(50) NOT NULL,                   -- Número del cliente que llama
    duration_seconds INT DEFAULT 0,                      -- Duración de la llamada
    transcript TEXT,                                      -- Transcripción completa de la conversación
    summary TEXT,                                         -- Resumen generado por la IA
    status VARCHAR(50) NOT NULL DEFAULT 'completed',      -- Estado (completed, missed, failed)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- ÍNDICES DE RENDIMIENTO
-- Aceleran las búsquedas frecuentes por empresa, correo, asistentes y llamadas
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_assistants_tenant_id ON assistants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_id ON call_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_assistant_id ON call_logs(assistant_id);