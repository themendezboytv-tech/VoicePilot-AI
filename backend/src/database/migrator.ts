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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calls (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
        caller_number VARCHAR(50),
        duration_seconds INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'completed',
        transcript TEXT,
        user_message TEXT,
        bot_response TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Parche de columnas por si la base de datos existía previa a este cambio
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'basic';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS system_prompt TEXT;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS greeting_message TEXT;
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100) DEFAULT 'default';
    ALTER TABLE assistants ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_number VARCHAR(50);
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript TEXT;
  `;

  try {
    await dbPool.query(migrationSQL);
    console.log('✅ Base de datos sincronizada sin errores.');
  } catch (error) {
    console.error('❌ Error crítico al migrar la base de datos:', error);
    process.exit(1); // Detiene la app si la base de datos no está alineada
  }
}