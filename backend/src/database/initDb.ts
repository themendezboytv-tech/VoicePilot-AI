// ==============================================================================
// SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS
// Proyecto: VoicePilot AI
// Descripción: Carga y ejecuta el archivo schema.sql completo en PostgreSQL.
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { dbPool } from '../config/database';

/**
 * Función autoejecutable para la creación e inicialización de la estructura de tablas
 */
async function initializeDatabase(): Promise<void> {
  console.log('==================================================');
  console.log('⚙️  Ejecutando migración de esquema en PostgreSQL...');
  console.log('==================================================');

  try {
    // 1. Leer el archivo de esquema SQL completo
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 2. Ejecutar la sentencia SQL completa en la base de datos
    await dbPool.query(schemaSql);

    console.log('✅ [PostgreSQL] Esquema multiempresa cargado exitosamente.');
    console.log(' ├─ Tabla "tenants" creada/verificada.');
    console.log(' ├─ Tabla "users" creada/verificada.');
    console.log(' ├─ Tabla "assistants" creada/verificada.');
    console.log(' └─ Tabla "call_logs" creada/verificada con todos sus índices.');
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ [PostgreSQL] Error al ejecutar las migraciones:', error);
  } finally {
    // 3. Cerrar la conexión del pool para liberar el proceso
    await dbPool.end();
  }
}

// Ejecutar el script
initializeDatabase();