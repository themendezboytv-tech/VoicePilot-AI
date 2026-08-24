// ==============================================================================
// SCRIPT: Siembra manual de un superadministrador de VoicePilot Admin
// Proyecto: VoicePilot AI
// Descripción: Única forma de crear un superadmin — no hay endpoint público
// de registro a propósito (ver docs/design-voicepilot-admin.md). Se corre a
// mano: `npm run seed:superadmin -- --email=... --password=...`.
//
// Por DEFECTO apunta a la base de datos real (carga backend/.env tal cual,
// igual que `npm run dev`) — es el script pensado para que el usuario cree
// el superadmin de producción él mismo. Para probarlo sin tocar
// alpha_database/alpha_cache, pasar --test: ahí redirige DB_*/REDIS_* a los
// contenedores de docker-compose.test.yml ANTES de cualquier import
// estático que abra conexión, mismo patrón que scripts/e2e-auth.ts (ver la
// trampa de import hoisting documentada en CLAUDE.md).
// ==============================================================================

import path from 'path';
import dotenv from 'dotenv';

const BACKEND_ROOT = path.resolve(__dirname, '..');

function parseArgs(): { email?: string; password?: string; test: boolean } {
  const args = process.argv.slice(2);
  const email = args.find((a) => a.startsWith('--email='))?.split('=')[1];
  const password = args.find((a) => a.startsWith('--password='))?.split('=')[1];
  const test = args.includes('--test');
  return { email, password, test };
}

async function main(): Promise<void> {
  const { email, password, test } = parseArgs();

  if (!email || !password) {
    console.error('Uso: npm run seed:superadmin -- --email=admin@ejemplo.com --password="una-clave-fuerte" [--test]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

  if (test) {
    console.log('🧪 Modo --test: apuntando a los contenedores de docker-compose.test.yml (nunca a producción).');
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5433';
    process.env.DB_NAME = 'voicepilot_test';
    process.env.DB_USER = 'test';
    process.env.DB_PASSWORD = 'test';
  } else {
    console.log('⚠️  Apuntando a la base de datos configurada en backend/.env (producción si no se cambió nada).');
  }

  // Import dinámico, después de resolver las env vars — ver comentario del
  // encabezado y la trampa documentada en CLAUDE.md.
  const { dbPool } = await import('../src/config/database');
  const { runMigrations } = await import('../src/database/migrator');
  const { hashPassword } = await import('../src/services/admin-auth.service');

  // Idempotente: en producción el server ya corrió esto al bootear, así que
  // no hace nada nuevo; en --test asegura que la tabla superadmins exista
  // en el contenedor descartable antes de insertar.
  await runMigrations();

  try {
    const existing = await dbPool.query('SELECT id FROM superadmins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`ℹ️  Ya existe un superadmin con el email ${email}. No se hizo ningún cambio.`);
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await dbPool.query(
      'INSERT INTO superadmins (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, passwordHash]
    );

    console.log('✅ Superadmin creado:', result.rows[0]);
  } finally {
    await dbPool.end();
  }
}

main().catch((error) => {
  console.error('💥 Error inesperado sembrando el superadmin:', error);
  process.exit(1);
});
