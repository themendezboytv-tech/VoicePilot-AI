// ==============================================================================
// MÓDULO DE CONEXIÓN: PostgreSQL Database Pool
// Proyecto: VoicePilot AI
// Descripción: Configuración del pool de conexiones a la base de datos relacional.
// ==============================================================================

import { Pool } from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

/**
 * Pool de conexiones reutilizables hacia PostgreSQL.
 * Optimiza el rendimiento evitando abrir/cerrar conexiones en cada consulta.
 */
export const dbPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secret_password',
  database: process.env.DB_NAME || 'voicepilot_db',
  max: 10, // Máximo de conexiones simultáneas en el pool
  idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexiones inactivas
});

/**
 * Función para probar la conexión activa con PostgreSQL
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const client = await dbPool.connect();
    console.log('✅ [PostgreSQL] Conexión establecida exitosamente con el contenedor alpha_database.');
    client.release(); // Libera la conexión para que vuelva al pool
    return true;
  } catch (error) {
    console.error('❌ [PostgreSQL] Error al conectar con la base de datos:', error);
    return false;
  }
}