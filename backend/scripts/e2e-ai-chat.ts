// ==============================================================================
// SCRIPT: Test manual end-to-end de /api/ai/chat
// Proyecto: VoicePilot AI
// Descripción: No hay framework de testing configurado en este repo, así que
// esto es un script imperativo (correr con `npm run test:e2e:ai-chat`) que
// levanta Postgres + Redis DESCARTABLES vía docker-compose.test.yml (puertos
// 5433/6380, contenedores voicepilot_test_db/voicepilot_test_cache),
// corre las migraciones reales, siembra un tenant + assistant de prueba,
// levanta un servidor Express mínimo con solo la ruta /api/ai montada,
// y pega contra ella con fetch para validar el flujo completo:
// HTTP -> controller -> Postgres -> Redis -> proveedor de IA real (Gemini)
// -> Postgres -> Redis -> HTTP.
//
// GARANTÍA DE SEGURIDAD: las variables de entorno de infraestructura
// (DB_*, REDIS_*) se pisan explícitamente ANTES de importar cualquier
// módulo que las lea, apuntando siempre a los contenedores de test. Este
// script JAMÁS toca alpha_database/alpha_cache (los de producción).
// ==============================================================================

import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

const BACKEND_ROOT = path.resolve(__dirname, '..');

// 1. Cargamos el .env real SOLO para heredar claves como GEMINI_API_KEY.
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

// 2. Pisamos TODO lo de infraestructura antes de que nada más se importe.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'voicepilot_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.NODE_ENV = 'test';

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
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY no está configurada en tu .env. El assistant de prueba usa ai_provider="gemini".');
    process.exit(1);
  }

  ensureTestContainersUp();

  // Import dinámico: recién ahora, con DB_HOST/REDIS_HOST ya apuntando a los
  // contenedores de test, es seguro cargar módulos que abren conexiones al
  // importarse (config/database.ts, config/redis.ts).
  const { dbPool, testDbConnection } = await import('../src/config/database');
  const { redisClient } = await import('../src/config/redis');
  const { runMigrations } = await import('../src/database/migrator');
  const aiRoutes = (await import('../src/routes/ai.routes')).default;
  const express = (await import('express')).default;

  console.log('⏳ Esperando a que Postgres de test acepte conexiones...');
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await dbPool.connect();
      client.release();
      break;
    } catch (error) {
      if (attempt >= 20) {
        throw new Error('Postgres de test no respondió en localhost:5433 tras 10s. ¿Corrió `docker compose -f docker-compose.test.yml up -d`?');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log('⏳ Esperando a que Redis de test acepte conexiones...');
  await redisClient.connect();

  await testDbConnection();

  console.log('📐 Ejecutando migraciones contra la base de test (voicepilot_test)...');
  await runMigrations();

  console.log('🌱 Sembrando tenant + assistant de prueba...');
  const runId = Date.now();
  const tenantResult = await dbPool.query(
    `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
    [`E2E Test Tenant ${runId}`, `e2e-test-${runId}`, 'basic']
  );
  const tenantId = tenantResult.rows[0].id;

  const assistantResult = await dbPool.query(
    `INSERT INTO assistants (tenant_id, name, system_prompt, greeting_message, ai_provider, telephony_provider)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      tenantId,
      `E2E Test Assistant ${runId}`,
      'Eres un asistente de pruebas automatizadas. Responde siempre en una sola frase breve.',
      'Hola, soy un asistente de prueba.',
      'gemini',
      'twilio'
    ]
  );
  const assistantId = assistantResult.rows[0].id;
  const callerNumber = '+10000000001';

  // Servidor mínimo: solo monta /api/ai, igual que el real, sin arrancar
  // todo index.ts (que además dispara sus propios banners y health checks).
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/ai', aiRoutes);

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
    // --- Caso 1: validación de campos obligatorios ---
    const missingFieldsRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(
      missingFieldsRes.status === 400,
      `POST /api/ai/chat sin assistant_id/message devuelve 400 (recibido: ${missingFieldsRes.status})`
    );

    // --- Caso 2: asistente inexistente -> 404, no 500 genérico ---
    const notFoundRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_id: '00000000-0000-0000-0000-000000000000', message: 'hola' })
    });
    assert(
      notFoundRes.status === 404,
      `POST /api/ai/chat con assistant_id inexistente devuelve 404 (recibido: ${notFoundRes.status})`
    );

    // --- Caso 3: flujo real, primer mensaje (llama a Gemini de verdad) ---
    const firstMessage = 'Mi color favorito es el azul. Respondé solo con: "ok test recibido".';
    const firstRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_id: assistantId, message: firstMessage, caller_number: callerNumber })
    });
    const firstBody = await firstRes.json();
    assert(firstRes.status === 200, `Primer mensaje responde 200 (recibido: ${firstRes.status}, body: ${JSON.stringify(firstBody)})`);
    assert(firstBody.success === true, 'Primer mensaje: success === true');
    assert(
      typeof firstBody.ai_response === 'string' && firstBody.ai_response.length > 0,
      'Primer mensaje: ai_response es un string no vacío (respuesta real de Gemini)'
    );
    assert(typeof firstBody.call_id === 'string' && firstBody.call_id.length > 0, 'Primer mensaje: devuelve call_id');

    // --- Caso 4: la llamada quedó persistida en Postgres ---
    const callRow = await dbPool.query('SELECT id, assistant_id FROM calls WHERE id = $1', [firstBody.call_id]);
    assert(callRow.rows.length === 1, 'La llamada quedó persistida en la tabla calls');
    assert(callRow.rows[0].assistant_id === assistantId, 'La llamada persistida tiene el assistant_id correcto');

    // --- Caso 5: segundo mensaje, para probar la memoria de sesión en Redis ---
    const secondMessage = '¿Cuál dije que era mi color favorito?';
    const secondRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_id: assistantId, message: secondMessage, caller_number: callerNumber })
    });
    assert(secondRes.status === 200, `Segundo mensaje responde 200 (recibido: ${secondRes.status})`);

    const historyKey = `chat_history:${assistantId}:${callerNumber}`;
    const history = await redisClient.get(historyKey);
    assert(!!history, `Existe historial en Redis bajo la key ${historyKey}`);
    assert(!!history && history.includes('azul'), 'El historial en Redis conserva el primer intercambio (memoria de sesión funcionando)');
    assert(!!history && history.includes(secondMessage), 'El historial en Redis incluye el segundo mensaje');

    console.log('\n🎉 Todos los checks pasaron. /api/ai/chat funciona de punta a punta contra la DB de test.');
  } catch (error) {
    failed = true;
    console.error('\n💥 El test E2E falló:', error);
  } finally {
    server.close();
    await dbPool.end();
    redisClient.disconnect();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Error inesperado corriendo el test E2E:', error);
  process.exit(1);
});
