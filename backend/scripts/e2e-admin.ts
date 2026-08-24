// ==============================================================================
// SCRIPT: Test manual end-to-end de VoicePilot Admin (/api/admin/*)
// Proyecto: VoicePilot AI
// Descripción: Mismo patrón que scripts/e2e-auth.ts — contenedores
// descartables (docker-compose.test.yml), migraciones reales, servidor
// Express mínimo con las rutas de admin Y de cliente montadas (para poder
// probar el aislamiento cruzado: un token de cliente no debe poder entrar
// a /api/admin/* y viceversa).
//
// GARANTÍA DE SEGURIDAD: nunca toca alpha_database/alpha_cache — las env
// vars de infraestructura se pisan ANTES de cualquier import estático.
// ==============================================================================

import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

const BACKEND_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'voicepilot_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-test-secret-cliente-no-usar-en-produccion';
process.env.ADMIN_JWT_SECRET = 'e2e-test-secret-admin-no-usar-en-produccion';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FALLIDA: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function ensureTestContainersUp(): void {
  console.log('🐳 Levantando contenedores de test (docker-compose.test.yml, puertos 5433/6380)...');
  execSync('docker compose -f docker-compose.test.yml up -d', {
    cwd: BACKEND_ROOT,
    stdio: 'inherit'
  });
}

async function main(): Promise<void> {
  ensureTestContainersUp();

  const { dbPool, testDbConnection } = await import('../src/config/database');
  const { redisClient } = await import('../src/config/redis');
  const { runMigrations } = await import('../src/database/migrator');
  const { hashPassword } = await import('../src/services/admin-auth.service');
  const authRoutes = (await import('../src/routes/auth.routes')).default;
  const adminAuthRoutes = (await import('../src/routes/admin-auth.routes')).default;
  const adminTenantRoutes = (await import('../src/routes/admin-tenants.routes')).default;
  const express = (await import('express')).default;

  console.log('⏳ Esperando a que Postgres de test acepte conexiones...');
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await dbPool.connect();
      client.release();
      break;
    } catch (error) {
      if (attempt >= 20) {
        throw new Error('Postgres de test no respondió en localhost:5433 tras 10s.');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  await redisClient.connect();
  await testDbConnection();

  console.log('📐 Ejecutando migraciones contra la base de test (voicepilot_test)...');
  await runMigrations();

  console.log('🌱 Sembrando un superadmin y dos tenants (uno con usuario cliente)...');
  const runId = Date.now();
  const adminEmail = `admin-${runId}@e2e-test.local`;
  const adminPassword = 'clave-admin-de-prueba-123';
  const adminPasswordHash = await hashPassword(adminPassword);
  await dbPool.query(`INSERT INTO superadmins (email, password_hash) VALUES ($1, $2)`, [adminEmail, adminPasswordHash]);

  const tenantResult = await dbPool.query(
    `INSERT INTO tenants (name, slug, plan, account_status) VALUES ($1, $2, 'basic', 'demo') RETURNING id`,
    [`E2E Admin Tenant ${runId}`, `e2e-admin-${runId}`, ]
  );
  const tenantId = tenantResult.rows[0].id;

  const clientPasswordHash = await hashPassword('clave-cliente-de-prueba-123');
  await dbPool.query(
    `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'owner')`,
    [tenantId, `cliente-${runId}@e2e-test.local`, clientPasswordHash]
  );

  // Un par de records/calls para que el agregado de actividad tenga algo que contar.
  await dbPool.query(
    `INSERT INTO records (tenant_id, record_type, status, channel) VALUES ($1, 'order', 'received', 'whatsapp'), ($1, 'order', 'completed', 'voice')`,
    [tenantId]
  );
  await dbPool.query(`INSERT INTO calls (tenant_id, channel) VALUES ($1, 'voice')`, [tenantId]);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/tenants', adminTenantRoutes);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No se pudo determinar el puerto del servidor de test.');
  }
  const baseUrl = `http://localhost:${address.port}`;
  console.log(`🚀 Servidor de test escuchando en ${baseUrl}`);

  let failed = false;

  try {
    // --- Login de admin: credenciales incorrectas ---
    const badAdminLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'incorrecta' })
    });
    assert(badAdminLoginRes.status === 401, `Login de admin con contraseña incorrecta devuelve 401 (recibido: ${badAdminLoginRes.status})`);

    // --- Login de admin correcto ---
    const adminLoginBody = await (await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    })).json();
    assert(typeof adminLoginBody.accessToken === 'string', 'Login de admin devuelve accessToken');
    const adminToken = adminLoginBody.accessToken as string;

    // --- Login de cliente correcto (para probar el aislamiento cruzado) ---
    const clientLoginBody = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `cliente-${runId}@e2e-test.local`, password: 'clave-cliente-de-prueba-123' })
    })).json();
    const clientToken = clientLoginBody.accessToken as string;

    // --- AISLAMIENTO CRUZADO: lo que pidió el usuario explícitamente ---
    const clientTryingAdminRoute = await fetch(`${baseUrl}/api/admin/tenants`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert(
      clientTryingAdminRoute.status === 401,
      `Un token de CLIENTE no puede entrar a /api/admin/tenants (recibido: ${clientTryingAdminRoute.status})`
    );

    const noTokenRes = await fetch(`${baseUrl}/api/admin/tenants`);
    assert(noTokenRes.status === 401, `/api/admin/tenants sin ningún token devuelve 401 (recibido: ${noTokenRes.status})`);

    // --- Listado de tenants con actividad agregada ---
    const tenantsListRes = await (await fetch(`${baseUrl}/api/admin/tenants`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })).json();
    const seededTenant = tenantsListRes.data.find((t: any) => t.id === tenantId);
    assert(!!seededTenant, 'GET /api/admin/tenants incluye el tenant sembrado');
    assert(Number(seededTenant.records_count) === 2, `El tenant sembrado muestra records_count=2 (recibido: ${seededTenant.records_count})`);
    assert(Number(seededTenant.calls_count) === 1, `El tenant sembrado muestra calls_count=1 (recibido: ${seededTenant.calls_count})`);
    assert(seededTenant.account_status === 'demo', "El tenant sembrado arranca en account_status='demo'");

    // --- Detalle de tenant, incluye usuarios y assistants ---
    const tenantDetailRes = await (await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })).json();
    assert(tenantDetailRes.data.users.length === 1, 'GET /api/admin/tenants/:id incluye los usuarios del tenant');
    assert(tenantDetailRes.data.users[0].password_hash === undefined, 'El detalle NO expone password_hash de los usuarios');

    const detailNotFoundRes = await fetch(`${baseUrl}/api/admin/tenants/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(detailNotFoundRes.status === 404, `GET /api/admin/tenants/:id con id inexistente devuelve 404 (recibido: ${detailNotFoundRes.status})`);

    // --- Aprobar: demo -> active ---
    const approveRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ account_status: 'active' })
    });
    const approveBody = await approveRes.json();
    assert(approveRes.status === 200, `PATCH account_status a 'active' devuelve 200 (recibido: ${approveRes.status})`);
    assert(approveBody.data.account_status === 'active', 'El tenant queda con account_status=active');

    // --- account_status inválido ---
    const invalidStatusRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ account_status: 'vip' })
    });
    assert(invalidStatusRes.status === 400, `PATCH con account_status inválido devuelve 400 (recibido: ${invalidStatusRes.status})`);

    // --- Suspender y reactivar ---
    const suspendRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ account_status: 'suspended' })
    });
    const suspendBody = await suspendRes.json();
    assert(suspendBody.data.account_status === 'suspended', 'Suspender deja account_status=suspended');

    const reactivateRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ account_status: 'active' })
    });
    const reactivateBody = await reactivateRes.json();
    assert(reactivateBody.data.account_status === 'active', 'Reactivar vuelve a dejar account_status=active');

    // --- Demo con fecha de expiración ---
    const demoExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const demoWithExpiryRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ account_status: 'demo', demo_expires_at: demoExpiresAt })
    });
    const demoWithExpiryBody = await demoWithExpiryRes.json();
    assert(demoWithExpiryBody.data.account_status === 'demo', 'Marcar demo con vencimiento deja account_status=demo');
    assert(!!demoWithExpiryBody.data.demo_expires_at, 'demo_expires_at queda seteado');

    // --- Asignar plan (texto libre) ---
    const planRes = await fetch(`${baseUrl}/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ plan: 'plan-piloto-negociado-a-mano' })
    });
    const planBody = await planRes.json();
    assert(planBody.data.plan === 'plan-piloto-negociado-a-mano', 'PATCH plan guarda cualquier texto libre, sin validar contra una lista fija');

    // --- Rate limiting de login de admin: 3 fallos por cuenta+IP bloquean el 4to ---
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: 'incorrecta-de-nuevo' })
      });
    }
    const fourthFailRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'incorrecta-de-nuevo' })
    });
    assert(fourthFailRes.status === 429, `4to intento fallido de login de admin (límite=3) devuelve 429 (recibido: ${fourthFailRes.status})`);

    console.log('\n🎉 Todos los checks de VoicePilot Admin pasaron.');
  } catch (error) {
    failed = true;
    console.error('\n💥 El test E2E de admin falló:', error);
  } finally {
    server.close();
    await dbPool.end();
    redisClient.disconnect();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Error inesperado corriendo el test E2E de admin:', error);
  process.exit(1);
});
