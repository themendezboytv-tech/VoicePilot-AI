// ==============================================================================
// SCRIPT: Test manual end-to-end de /api/auth/* y del cierre de autorización
// multi-tenant en tenants/assistants/records/calls.
// Proyecto: VoicePilot AI
// Descripción: Mismo patrón que scripts/e2e-ai-chat.ts — levanta Postgres +
// Redis DESCARTABLES vía docker-compose.test.yml, corre las migraciones
// reales, siembra DOS tenants con un usuario cada uno, levanta un servidor
// Express mínimo con auth/tenants/assistants/records/calls montadas, y
// valida con fetch tanto el flujo de login/refresh/logout como que un
// usuario del tenant A nunca pueda ver ni tocar datos del tenant B.
//
// GARANTÍA DE SEGURIDAD: las variables de entorno de infraestructura
// (DB_*, REDIS_*) se pisan explícitamente ANTES de importar cualquier
// módulo que las lea. Este script JAMÁS toca alpha_database/alpha_cache.
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
process.env.JWT_SECRET = 'e2e-test-secret-no-usar-en-produccion';

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
  const { hashPassword } = await import('../src/services/auth.service');
  const authRoutes = (await import('../src/routes/auth.routes')).default;
  const tenantRoutes = (await import('../src/routes/tenant.routes')).default;
  const assistantRoutes = (await import('../src/routes/assistant.routes')).default;
  const recordRoutes = (await import('../src/routes/record.routes')).default;
  const callRoutes = (await import('../src/routes/call.routes')).default;
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

  console.log('🌱 Sembrando dos tenants con un usuario cada uno...');
  const runId = Date.now();
  const passwordPlain = 'clave-de-prueba-123';
  const passwordHash = await hashPassword(passwordPlain);

  async function seedTenantWithUser(label: string) {
    const tenantResult = await dbPool.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [`E2E Auth Tenant ${label} ${runId}`, `e2e-auth-${label}-${runId}`, 'basic']
    );
    const tenantId = tenantResult.rows[0].id;

    const userResult = await dbPool.query(
      `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, `${label}-${runId}@e2e-test.local`, passwordHash, 'owner']
    );
    const userId = userResult.rows[0].id;

    return { tenantId, userId, email: `${label}-${runId}@e2e-test.local` };
  }

  const tenantA = await seedTenantWithUser('a');
  const tenantB = await seedTenantWithUser('b');

  const app = express();
  app.use(express.json());
  // Necesario para que req.ip lea X-Forwarded-For (igual que en producción
  // detrás del túnel de Cloudflare) — el rate limiting de login/registro
  // depende de esto, y los tests de abajo simulan distintas IPs con este
  // header.
  app.set('trust proxy', true);
  app.use('/api/auth', authRoutes);
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/assistants', assistantRoutes);
  app.use('/api/records', recordRoutes);
  app.use('/api/calls', callRoutes);

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
    // --- Login: contraseña incorrecta ---
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tenantA.email, password: 'incorrecta' })
    });
    assert(badLoginRes.status === 401, `Login con contraseña incorrecta devuelve 401 (recibido: ${badLoginRes.status})`);

    // --- Login: usuario inexistente (mismo status que password incorrecta) ---
    const noUserRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-existe@e2e-test.local', password: 'lo-que-sea' })
    });
    assert(noUserRes.status === 401, `Login con email inexistente devuelve 401 (recibido: ${noUserRes.status})`);

    // ==========================================================================
    // RATE LIMITING de /api/auth/login y /api/auth/register
    // ==========================================================================

    const loginAttempt = (email: string, password: string, fakeIp: string) =>
      fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
        body: JSON.stringify({ email, password })
      });

    // --- Límite por cuenta+IP: el atacante se bloquea a sí mismo, no a la víctima ---
    const attackerIp = '10.0.0.1';
    const victimIp = '10.0.0.2';

    let lastAttackerRes;
    for (let i = 0; i < 5; i++) {
      lastAttackerRes = await loginAttempt(tenantA.email, 'incorrecta', attackerIp);
    }
    assert(lastAttackerRes!.status === 401, '5 intentos fallidos seguidos (email+IP del atacante) todavía devuelven 401, no 429');

    const sixthAttackerRes = await loginAttempt(tenantA.email, 'incorrecta', attackerIp);
    assert(sixthAttackerRes.status === 429, `El 6to intento fallido desde la MISMA IP+cuenta devuelve 429 (recibido: ${sixthAttackerRes.status})`);
    assert(!!sixthAttackerRes.headers.get('retry-after'), 'La respuesta 429 incluye header Retry-After');

    // La víctima, desde SU propia IP, sigue pudiendo loguearse normal —
    // esto es lo que se pidió arreglar: nadie puede dejarla afuera de su
    // cuenta solo sabiendo su email.
    const victimLoginRes = await loginAttempt(tenantA.email, passwordPlain, victimIp);
    assert(victimLoginRes.status === 200, `La víctima puede loguearse desde su propia IP pese al ataque contra su cuenta (recibido: ${victimLoginRes.status})`);

    // Ese mismo login exitoso limpia los contadores de (email, victimIp) —
    // sigue bloqueado el combo (email, attackerIp), que es un par distinto.
    const attackerStillBlockedRes = await loginAttempt(tenantA.email, 'incorrecta', attackerIp);
    assert(attackerStillBlockedRes.status === 429, `El atacante sigue bloqueado tras el login exitoso de la víctima (recibido: ${attackerStillBlockedRes.status})`);

    // --- Límite por IP: 10 fallos contra CUALQUIER cuenta desde una sola IP, aunque nunca repita cuenta ---
    const sprayIp = '10.0.0.3';
    let lastSprayRes;
    for (let i = 0; i < 10; i++) {
      lastSprayRes = await loginAttempt(`no-existe-${i}@e2e-test.local`, 'lo-que-sea', sprayIp);
    }
    assert(lastSprayRes!.status === 401, '10 intentos contra 10 cuentas distintas desde la misma IP todavía devuelven 401 (ninguna cuenta individual llegó a su límite)');

    const eleventhSprayRes = await loginAttempt('otra-cuenta-mas@e2e-test.local', 'lo-que-sea', sprayIp);
    assert(eleventhSprayRes.status === 429, `El intento nº11 desde esa IP devuelve 429 por el límite global de IP (recibido: ${eleventhSprayRes.status})`);

    // --- Límite de /api/auth/register por IP ---
    const registerIp = '10.0.0.4';
    const registerAttempt = (suffix: number) =>
      fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': registerIp },
        body: JSON.stringify({
          business_name: `Negocio Rate Limit ${runId}-${suffix}`,
          email: `rl-${runId}-${suffix}@e2e-test.local`,
          password: passwordPlain
        })
      });

    let lastRegisterRes;
    for (let i = 0; i < 5; i++) {
      lastRegisterRes = await registerAttempt(i);
    }
    assert(lastRegisterRes!.status === 201, 'Los primeros 5 registros desde una IP se crean normalmente (recibido 201)');

    const sixthRegisterRes = await registerAttempt(5);
    assert(sixthRegisterRes.status === 429, `El 6to registro desde la misma IP en la misma hora devuelve 429 (recibido: ${sixthRegisterRes.status})`);

    // --- Login correcto de A y B ---
    const loginA = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tenantA.email, password: passwordPlain })
    })).json();
    assert(typeof loginA.accessToken === 'string' && loginA.accessToken.length > 0, 'Login de A devuelve accessToken');
    assert(typeof loginA.refreshToken === 'string' && loginA.refreshToken.length > 0, 'Login de A devuelve refreshToken');

    const loginB = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tenantB.email, password: passwordPlain })
    })).json();

    const tokenA = loginA.accessToken as string;
    const tokenB = loginB.accessToken as string;

    // --- requireAuth: sin token ---
    const noTokenRes = await fetch(`${baseUrl}/api/tenants`);
    assert(noTokenRes.status === 401, `GET /api/tenants sin token devuelve 401 (recibido: ${noTokenRes.status})`);

    // --- GET /api/tenants devuelve SOLO el propio tenant ---
    const tenantsA = await (await fetch(`${baseUrl}/api/tenants`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })).json();
    assert(tenantsA.total === 1, `GET /api/tenants con token A devuelve exactamente 1 fila (recibido: ${tenantsA.total})`);
    assert(tenantsA.data[0].id === tenantA.tenantId, 'GET /api/tenants con token A devuelve el tenant correcto');

    // --- POST /api/assistants ignora tenant_id del body y usa el del token ---
    const createAssistantRes = await fetch(`${baseUrl}/api/assistants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        tenant_id: tenantB.tenantId, // intento de colar un tenant ajeno
        name: 'Asistente E2E',
        system_prompt: 'prompt',
        greeting_message: 'hola'
      })
    });
    const createdAssistant = await createAssistantRes.json();
    assert(createAssistantRes.status === 201, `POST /api/assistants con token A devuelve 201 (recibido: ${createAssistantRes.status})`);
    assert(
      createdAssistant.data.tenant_id === tenantA.tenantId,
      'El assistant se crea bajo el tenant del TOKEN, no el del body (protección contra tenant_id falsificado)'
    );

    // --- El assistant de A no aparece en el listado de B ---
    const assistantsB = await (await fetch(`${baseUrl}/api/assistants`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    })).json();
    assert(assistantsB.total === 0, `GET /api/assistants con token B no ve el assistant de A (recibido total: ${assistantsB.total})`);

    // --- Record creado directo en DB bajo tenant B; A no puede leerlo ni tocarlo ---
    const recordB = await dbPool.query(
      `INSERT INTO records (tenant_id, record_type, status, data) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantB.tenantId, 'order', 'received', JSON.stringify({ items: 'pizza' })]
    );
    const recordBId = recordB.rows[0].id;

    const getRecordCrossTenant = await fetch(`${baseUrl}/api/records/${recordBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(getRecordCrossTenant.status === 404, `GET /api/records/:id de otro tenant devuelve 404 (recibido: ${getRecordCrossTenant.status})`);

    const patchRecordCrossTenant = await fetch(`${baseUrl}/api/records/${recordBId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ status: 'cancelled' })
    });
    assert(patchRecordCrossTenant.status === 404, `PATCH /api/records/:id/status de otro tenant devuelve 404 (recibido: ${patchRecordCrossTenant.status})`);

    const recordStillReceived = await dbPool.query('SELECT status FROM records WHERE id = $1', [recordBId]);
    assert(recordStillReceived.rows[0].status === 'received', 'El status del record de B no cambió tras el intento cross-tenant de A');

    // --- Filtro de fechas en /api/records: from en el futuro no debe traer nada ---
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const recordsFutureFilter = await (await fetch(`${baseUrl}/api/records?from=${encodeURIComponent(futureDate)}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    })).json();
    assert(recordsFutureFilter.total === 0, `GET /api/records?from=<futuro> no trae records (recibido: ${recordsFutureFilter.total})`);

    // --- POST /api/auth/register: crea tenant + usuario owner, nace en account_status='demo' ---
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: `Negocio Registrado ${runId}`,
        email: `registrado-${runId}@e2e-test.local`,
        password: passwordPlain
      })
    });
    const registerBody = await registerRes.json();
    assert(registerRes.status === 201, `POST /api/auth/register devuelve 201 (recibido: ${registerRes.status}, body: ${JSON.stringify(registerBody)})`);
    assert(typeof registerBody.accessToken === 'string', 'Register devuelve un accessToken (auto-login)');

    const registeredTenant = await dbPool.query('SELECT account_status FROM tenants WHERE id = $1', [registerBody.user.tenant_id]);
    assert(registeredTenant.rows[0].account_status === 'demo', `El tenant registrado nace con account_status='demo' (recibido: ${registeredTenant.rows[0].account_status})`);

    // --- Register con email duplicado -> 409, sin crear un tenant huérfano ---
    const duplicateRegisterRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: `Negocio Duplicado ${runId}`,
        email: `registrado-${runId}@e2e-test.local`,
        password: passwordPlain
      })
    });
    assert(duplicateRegisterRes.status === 409, `POST /api/auth/register con email repetido devuelve 409 (recibido: ${duplicateRegisterRes.status})`);

    // --- GET /api/tenants/:id y PATCH: solo sobre el propio tenant ---
    const getOwnTenantRes = await fetch(`${baseUrl}/api/tenants/${tenantA.tenantId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(getOwnTenantRes.status === 200, `GET /api/tenants/:id del propio tenant devuelve 200 (recibido: ${getOwnTenantRes.status})`);

    const getOtherTenantRes = await fetch(`${baseUrl}/api/tenants/${tenantB.tenantId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(getOtherTenantRes.status === 404, `GET /api/tenants/:id de otro tenant devuelve 404 (recibido: ${getOtherTenantRes.status})`);

    const patchOwnTenantRes = await fetch(`${baseUrl}/api/tenants/${tenantA.tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ delivery_whatsapp_number: '+593999999999' })
    });
    const patchOwnTenantBody = await patchOwnTenantRes.json();
    assert(patchOwnTenantRes.status === 200, `PATCH /api/tenants/:id del propio tenant devuelve 200 (recibido: ${patchOwnTenantRes.status})`);
    assert(
      patchOwnTenantBody.data.delivery_whatsapp_number === '+593999999999',
      'PATCH /api/tenants/:id actualiza delivery_whatsapp_number'
    );

    const patchOtherTenantRes = await fetch(`${baseUrl}/api/tenants/${tenantB.tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Nombre hackeado' })
    });
    assert(patchOtherTenantRes.status === 404, `PATCH /api/tenants/:id de otro tenant devuelve 404 (recibido: ${patchOtherTenantRes.status})`);

    // --- GET /api/assistants/:id y PATCH: solo sobre asistentes del propio tenant ---
    const getOwnAssistantRes = await fetch(`${baseUrl}/api/assistants/${createdAssistant.data.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(getOwnAssistantRes.status === 200, `GET /api/assistants/:id del propio tenant devuelve 200 (recibido: ${getOwnAssistantRes.status})`);

    const getOtherAssistantRes = await fetch(`${baseUrl}/api/assistants/${createdAssistant.data.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(getOtherAssistantRes.status === 404, `GET /api/assistants/:id desde otro tenant devuelve 404 (recibido: ${getOtherAssistantRes.status})`);

    const patchAssistantRes = await fetch(`${baseUrl}/api/assistants/${createdAssistant.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ pricing_info: { pizza_muzzarella: 5000 }, business_hours: { lun_vie: '09:00-18:00' } })
    });
    const patchAssistantBody = await patchAssistantRes.json();
    assert(patchAssistantRes.status === 200, `PATCH /api/assistants/:id del propio tenant devuelve 200 (recibido: ${patchAssistantRes.status})`);
    assert(
      patchAssistantBody.data.pricing_info.pizza_muzzarella === 5000,
      'PATCH /api/assistants/:id guarda pricing_info como JSONB'
    );

    const patchAssistantFromOtherTenantRes = await fetch(`${baseUrl}/api/assistants/${createdAssistant.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'Robado' })
    });
    assert(
      patchAssistantFromOtherTenantRes.status === 404,
      `PATCH /api/assistants/:id desde otro tenant devuelve 404 (recibido: ${patchAssistantFromOtherTenantRes.status})`
    );

    // --- Refresh: rota el token, el viejo queda inservible ---
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginA.refreshToken })
    });
    const refreshBody = await refreshRes.json();
    assert(refreshRes.status === 200, `POST /api/auth/refresh con token válido devuelve 200 (recibido: ${refreshRes.status})`);
    assert(typeof refreshBody.accessToken === 'string', 'Refresh devuelve un accessToken nuevo');
    assert(refreshBody.refreshToken !== loginA.refreshToken, 'Refresh devuelve un refreshToken distinto (rotación)');

    const reuseOldRefreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginA.refreshToken })
    });
    assert(reuseOldRefreshRes.status === 401, `Reusar un refreshToken ya rotado devuelve 401 (recibido: ${reuseOldRefreshRes.status})`);

    // --- Logout revoca el refresh token vigente ---
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshBody.refreshToken })
    });
    assert(logoutRes.status === 200, `POST /api/auth/logout devuelve 200 (recibido: ${logoutRes.status})`);

    const refreshAfterLogoutRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshBody.refreshToken })
    });
    assert(refreshAfterLogoutRes.status === 401, `Refresh con un token deslogueado devuelve 401 (recibido: ${refreshAfterLogoutRes.status})`);

    console.log('\n🎉 Todos los checks de auth y aislamiento multi-tenant pasaron.');
  } catch (error) {
    failed = true;
    console.error('\n💥 El test E2E de auth falló:', error);
  } finally {
    server.close();
    await dbPool.end();
    redisClient.disconnect();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Error inesperado corriendo el test E2E de auth:', error);
  process.exit(1);
});
