import { dbPool } from '../config/database';

export async function runMigrations(): Promise<void> {
  console.log('🔄 Ejecutando sincronización de esquema en PostgreSQL...');

  const migrationSQL = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE,
        plan VARCHAR(50) DEFAULT 'basic',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

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
        -- Marca a un asistente como "toma pedidos/turnos": habilita la
        -- captura de datos estructurados (ver record-capture.service.ts) en
        -- cualquier canal que lo consulte. false por defecto para no cambiar
        -- el comportamiento de ningún asistente existente.
        captures_records BOOLEAN DEFAULT false,
        -- record_type a usar cuando se crea un record desde este asistente
        -- si el propio JSON estructurado no trae uno explícito.
        default_record_type VARCHAR(50) DEFAULT 'order',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- TABLA RECORDS: modelo genérico de "resultado de negocio" (pedido, turno,
    -- reserva, etc.). Una sola tabla física para todos los tipos de negocio;
    -- lo específico de cada vertical vive en data (JSONB) en vez de requerir
    -- una tabla nueva por tipo de negocio.
    CREATE TABLE IF NOT EXISTS records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
        -- Interacción (fila de calls) que originó o actualizó este registro.
        -- Nullable a propósito: a futuro un registro podría crearse sin pasar
        -- por una conversación (carga manual, API directa).
        interaction_id UUID REFERENCES calls(id) ON DELETE SET NULL,
        record_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'received',
        -- Canal de origen (voice, whatsapp, web_chat...). Se guarda acá además
        -- de en calls.channel porque la continuidad de un registro debe
        -- poder chequearse sin importar el canal que lo originó (ver regla de
        -- continuidad más abajo) y porque un registro podría no tener
        -- interaction_id asociado.
        channel VARCHAR(50) NOT NULL DEFAULT 'voice',
        contact_name VARCHAR(255),
        contact_identifier VARCHAR(255),
        data JSONB DEFAULT '{}',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        -- No hay trigger que lo actualice solo: como el resto del proyecto no
        -- usa ORM, cualquier UPDATE sobre records debe setear updated_at =
        -- NOW() explícitamente en el propio SQL.
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- TABLA USERS: usuarios humanos del panel de cliente (no confundir con
    -- "contactos" de records, que son clientes finales del negocio). Un
    -- usuario pertenece a un solo tenant.
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        -- 'owner': dueño de la cuenta (único con acceso a Ajustes de cuenta
        -- a futuro). 'staff': acceso operativo (dashboard, registros), sin
        -- poder editar configuración del asistente ni usuarios.
        role VARCHAR(20) NOT NULL DEFAULT 'staff',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- TABLA REFRESH_TOKENS: nunca se guarda el token en texto plano, solo su
    -- hash (SHA-256) — igual que password_hash, para que un dump de la DB no
    -- alcance para robar sesiones. Rotado en cada uso (ver auth.service.ts).
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Parche de columnas por si la base de datos existía previa a este cambio
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'basic';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    -- Vertical de negocio del tenant (restaurant, barbershop, ...). Solo
    -- metadata para reportes/onboarding por ahora, no bifurca ningún código.
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);
    -- Estado de la cuenta para el registro público (POST /api/auth/register):
    -- toda cuenta nueva nace en 'demo'. Por ahora es solo informativo/visible
    -- en la tabla — no bloquea ninguna funcionalidad todavía; el día que
    -- exista "VoicePilot Admin" para aprobar cuentas manualmente, ahí se
    -- decide qué gatear según este valor (ver CLAUDE.md).
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'demo';
    -- Contacto de WhatsApp del repartidor/staff que recibe la notificación de
    -- pedido listo (ver order-notifications.service.ts). Reemplaza el env var
    -- global DELIVERY_WHATSAPP_NUMBER una vez que el panel lo puede editar.
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_whatsapp_number VARCHAR(50);
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS system_prompt TEXT;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS greeting_message TEXT;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100) DEFAULT 'default';
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'gemini';
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS telephony_provider VARCHAR(50) DEFAULT 'twilio';
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS captures_records BOOLEAN DEFAULT false;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS default_record_type VARCHAR(50) DEFAULT 'order';
    -- Precios/servicios y horarios de atención, editables desde la página
    -- "Configuración del asistente" del panel. Formato libre (JSONB) porque
    -- varía por vertical de negocio (menú de restaurante vs. servicios de
    -- peluquería vs. ...) — mismo criterio que records.data.
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS pricing_info JSONB DEFAULT '{}';
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}';
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_number VARCHAR(50);
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_sid VARCHAR(64);
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript TEXT;
    -- Canal que generó esta fila de calls (voice, whatsapp, web_chat...).
    -- Hasta ahora tanto el canal de voz como el de texto (/api/ai/chat)
    -- insertaban acá sin ninguna forma de distinguirlos.
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NOT NULL DEFAULT 'voice';
    ALTER TABLE records ADD COLUMN IF NOT EXISTS interaction_id UUID REFERENCES calls(id) ON DELETE SET NULL;
    ALTER TABLE records ADD COLUMN IF NOT EXISTS record_type VARCHAR(50);
    ALTER TABLE records ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'received';
    ALTER TABLE records ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NOT NULL DEFAULT 'voice';
    ALTER TABLE records ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
    ALTER TABLE records ADD COLUMN IF NOT EXISTS contact_identifier VARCHAR(255);
    ALTER TABLE records ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
    ALTER TABLE records ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

    CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid);
    CREATE INDEX IF NOT EXISTS idx_records_tenant ON records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_records_interaction ON records(interaction_id);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    -- Soporta el chequeo de continuidad entre canales: "¿este contacto tiene
    -- un registro abierto reciente?" sin filtrar por channel a propósito, para
    -- que una conversación de voz pueda continuar un registro abierto por
    -- WhatsApp (o viceversa) — ver regla de continuidad en CLAUDE.md/diseño.
    CREATE INDEX IF NOT EXISTS idx_records_contact_lookup
        ON records(tenant_id, contact_identifier, status, updated_at DESC);
  `;

  try {
    await dbPool.query(migrationSQL);
    console.log('✅ Base de datos sincronizada sin errores.');
  } catch (error) {
    console.error('❌ Error crítico al migrar la base de datos:', error);
    process.exit(1); // Detiene la app si la base de datos no está alineada
  }
}