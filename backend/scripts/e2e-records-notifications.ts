// ==============================================================================
// SCRIPT: Test E2E del flujo de records + notificación al repartidor
// Proyecto: VoicePilot AI
// Descripción: Igual que scripts/e2e-ai-chat.ts (mismo patrón: levanta
// Postgres+Redis descartables vía docker-compose.test.yml, corre las
// migraciones reales, siembra datos, levanta un Express mínimo y pega
// contra él con fetch), pero cubre el flujo de /api/records +
// order-notifications.service.ts que hasta ahora solo se había probado a
// mano (incluyendo el envío real de WhatsApp a un repartidor de verdad —
// ver CLAUDE.md, notifyDeliveryPerson manual test 2026-08-23):
//   1) creación de un record
//   2) continuidad de ~3h para el mismo contacto (y qué pasa cuando esa
//      ventana ya expiró)
//   3) force_new para saltear la continuidad a propósito
//   4) cambio de status y validación de status inválido
//   5) que PATCH a status='ready' dispare notifyDeliveryPerson() — sin
//      mandar un WhatsApp real: WHATSAPP_UNIFICADO_URL se apunta a un
//      servidor HTTP de mentira levantado acá mismo, que graba qué
//      requests recibió, así este script NUNCA toca whatsapp-unificado
//      real ni ningún proceso de producción.
//   6) que otros cambios de status (ej. 'in_progress') NO disparen la
//      notificación.
//   7) estimateWaitMinutes(): que la estimación suba con la cantidad de
//      records en cola del mismo tenant.
//
// GARANTÍA DE SEGURIDAD: mismo patrón que e2e-ai-chat.ts — DB_*/REDIS_*
// así como WHATSAPP_UNIFICADO_URL se pisan ANTES de cualquier import
// estático de código de la app (ver "Import dinámico" más abajo y la
// trampa documentada en CLAUDE.md sobre hoisting de imports). Este script
// jamás toca alpha_database/alpha_cache ni el proceso real whatsapp-unificado.
//
// Nota (post-merge de feat/customer-panel-auth): /api/records ahora exige
// requireAuth. En vez de loguearse por HTTP, se firma un JWT directo con
// signAccessToken() para cada tenant sembrado — más rápido y evita tener
// que sembrar también un usuario con password real solo para este test.
// ==============================================================================

import { execSync } from 'child_process';
import path from 'path';
import http from 'http';
import dotenv from 'dotenv';

const BACKEND_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

// Pisamos TODO lo de infraestructura antes de que nada más se importe.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'voicepilot_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.NODE_ENV = 'test';
// order-notifications.service.ts necesita esto seteado para no hacer
// no-op — el valor exacto no importa, solo tiene que ser truthy.
process.env.DELIVERY_WHATSAPP_NUMBER = '+10000000099';
process.env.WHATSAPP_UNIFICADO_SECRET = 'test-secret';
// requireAuth (auth.middleware.ts) necesita esto para firmar/verificar los
// JWT que este script genera directo con signAccessToken(), sin pasar por
// un login HTTP real.
process.env.JWT_SECRET = 'e2e-records-test-secret-no-usar-en-produccion';
// Se completa más abajo, una vez que sabemos en qué puerto quedó el mock.
process.env.WHATSAPP_UNIFICADO_URL = '';

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

interface MockWhatsappRequest {
  telefono: string;
  mensaje: string;
}

/**
 * Servidor HTTP de mentira que reemplaza a whatsapp-unificado para este
 * test: escucha POST /send con el mismo contrato real ({telefono, mensaje}
 * + header X-Secret) y guarda cada request recibida en memoria, en vez de
 * mandar nada a WhatsApp de verdad.
 */
function startMockWhatsappUnificado(): Promise<{ port: number; received: MockWhatsappRequest[]; close: () => Promise<void> }> {
  const received: MockWhatsappRequest[] = [];

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          received.push({ telefono: parsed.telefono, mensaje: parsed.mensaje });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        received,
        close: () => new Promise<void>((res) => server.close(() => res()))
      });
    });
  });
}

/**
 * notifyDeliveryPerson() se llama fire-and-forget (.catch, sin await)
 * desde el controller, así que el request HTTP de PATCH puede responder
 * antes de que el POST /send al mock haya llegado. En vez de un sleep fijo
 * (lento y potencialmente flaky), hacemos polling corto.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 50): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

async function main(): Promise<void> {
  ensureTestContainersUp();

  const mockWhatsapp = await startMockWhatsappUnificado();
  process.env.WHATSAPP_UNIFICADO_URL = `http://127.0.0.1:${mockWhatsapp.port}`;
  console.log(`📱 Mock de whatsapp-unificado escuchando en ${process.env.WHATSAPP_UNIFICADO_URL} (NO es el proceso real)`);

  // Import dinámico: recién ahora, con todas las env vars ya seteadas, es
  // seguro cargar módulos que abren conexiones o leen env vars al
  // importarse (config/database.ts, config/redis.ts, order-notifications.service.ts).
  const { dbPool, testDbConnection } = await import('../src/config/database');
  const { redisClient } = await import('../src/config/redis');
  const { runMigrations } = await import('../src/database/migrator');
  const { estimateWaitMinutes } = await import('../src/services/order-notifications.service');
  const { signAccessToken } = await import('../src/services/auth.service');
  const recordRoutes = (await import('../src/routes/record.routes')).default;
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

  console.log('🌱 Sembrando tenants de prueba...');
  const runId = Date.now();

  async function seedTenant(suffix: string): Promise<string> {
    const result = await dbPool.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [`E2E Records Tenant ${runId}${suffix}`, `e2e-records-${runId}${suffix}`, 'basic']
    );
    return result.rows[0].id;
  }

  const tenantId = await seedTenant('');
  const otherTenantId = await seedTenant('-b');

  // Tokens firmados directo (sin usuario/password real) — este script solo
  // necesita pasar requireAuth, no probar el login en sí (eso ya lo cubre
  // scripts/e2e-auth.ts).
  const authToken = signAccessToken({ sub: 'e2e-user', tenant_id: tenantId, role: 'owner', email: 'e2e@test.local' });
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/records', recordRoutes);

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
    // --- Caso 1: creación básica de un record ---
    const contactIdentifier = '+50600000001';
    const createRes = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: tenantId,
        record_type: 'order',
        channel: 'whatsapp',
        contact_identifier: contactIdentifier,
        data: { items: ['1 pizza de pepperoni'], customer_name: 'Jose' }
      })
    });
    const createBody = await createRes.json();
    assert(createRes.status === 201, `POST /api/records crea un record nuevo (recibido: ${createRes.status}, body: ${JSON.stringify(createBody)})`);
    assert(createBody.created === true, 'La respuesta indica created: true');
    const recordId = createBody.data.id;
    assert(typeof recordId === 'string' && recordId.length > 0, 'El record creado tiene id');

    // --- Caso 2: continuidad — mismo contacto, sin force_new, dentro de la ventana ---
    const continuityRes = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: tenantId,
        record_type: 'order',
        contact_identifier: contactIdentifier,
        data: { items: ['1 coca cola'] }
      })
    });
    const continuityBody = await continuityRes.json();
    assert(continuityRes.status === 200, `Continuidad: mismo contacto sin force_new responde 200 en vez de crear (recibido: ${continuityRes.status})`);
    assert(continuityBody.created === false, 'Continuidad: created === false');
    assert(continuityBody.open_record_found === true, 'Continuidad: open_record_found === true');
    assert(continuityBody.data.id === recordId, 'Continuidad: devuelve el mismo record abierto, no uno nuevo');

    // --- Caso 3: force_new salta la continuidad a propósito ---
    const forceNewRes = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: tenantId,
        record_type: 'order',
        contact_identifier: contactIdentifier,
        data: { items: ['pedido distinto'] },
        force_new: true
      })
    });
    const forceNewBody = await forceNewRes.json();
    assert(forceNewRes.status === 201, `force_new=true crea un record nuevo pese a haber uno abierto (recibido: ${forceNewRes.status})`);
    assert(forceNewBody.data.id !== recordId, 'force_new=true: el record creado es distinto al abierto anteriormente');
    const secondRecordId = forceNewBody.data.id;

    // --- Caso 4: ventana de continuidad expirada (~3h) ---
    // findOpenRecordForContact toma el record ABIERTO más reciente del
    // contacto — para probar la expiración de secondRecordId primero hay
    // que sacar de en medio al record del caso 1 (recordId), que seguiría
    // "abierto y reciente" y taparía el resultado. Cerrarlo acá no rompe
    // los casos 5-9 (patchean status por id sin importar el status previo).
    await dbPool.query(`UPDATE records SET status = 'completed' WHERE id = $1`, [recordId]);
    // En vez de esperar 3 horas de verdad, retrocedemos updated_at a mano
    // (misma columna que la query de continuidad usa como corte) y
    // confirmamos que YA NO se la considera "abierta".
    await dbPool.query(`UPDATE records SET updated_at = NOW() - INTERVAL '4 hours' WHERE id = $1`, [secondRecordId]);
    const expiredWindowRes = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: tenantId,
        record_type: 'order',
        contact_identifier: contactIdentifier,
        data: { items: ['pedido después de que expiró la ventana'] }
      })
    });
    const expiredWindowBody = await expiredWindowRes.json();
    assert(expiredWindowRes.status === 201, `Ventana de continuidad expirada (4h): se crea un record nuevo en vez de reusar el viejo (recibido: ${expiredWindowRes.status})`);
    assert(expiredWindowBody.data.id !== recordId && expiredWindowBody.data.id !== secondRecordId, 'Ventana expirada: el record creado no es ninguno de los anteriores');

    // --- Caso 5: status inválido ---
    const invalidStatusRes = await fetch(`${baseUrl}/api/records/${recordId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'no_existe' })
    });
    assert(invalidStatusRes.status === 400, `PATCH status inválido devuelve 400 (recibido: ${invalidStatusRes.status})`);

    // --- Caso 6: status='in_progress' NO dispara notificación al repartidor ---
    const inProgressRes = await fetch(`${baseUrl}/api/records/${recordId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert(inProgressRes.status === 200, `PATCH status=in_progress responde 200 (recibido: ${inProgressRes.status})`);
    // Pequeña espera para confirmar ausencia (no solo falta de tiempo).
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(mockWhatsapp.received.length === 0, 'status=in_progress: NO se llamó al mock de WhatsApp (todavía)');

    // --- Caso 7: status='ready' SÍ dispara notifyDeliveryPerson() ---
    const readyRes = await fetch(`${baseUrl}/api/records/${recordId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'ready' })
    });
    const readyBody = await readyRes.json();
    assert(readyRes.status === 200, `PATCH status=ready responde 200 (recibido: ${readyRes.status})`);
    assert(readyBody.data.status === 'ready', 'El record actualizado refleja status=ready');

    const notified = await waitFor(() => mockWhatsapp.received.length === 1);
    assert(notified, 'status=ready: notifyDeliveryPerson() llegó a llamar al mock de WhatsApp (fire-and-forget, con polling corto)');

    const notification = mockWhatsapp.received[0];
    assert(notification.telefono === '+10000000099', 'La notificación se manda a DELIVERY_WHATSAPP_NUMBER');
    assert(notification.mensaje.includes('Jose'), 'El mensaje incluye el nombre del cliente (data.customer_name)');
    assert(notification.mensaje.includes('pizza de pepperoni'), 'El mensaje incluye los items del pedido');
    assert(notification.mensaje.includes(contactIdentifier), 'El mensaje incluye el teléfono de contacto');

    // --- Caso 8: un segundo PATCH a ready sobre OTRO record no reusa la misma notificación ---
    await fetch(`${baseUrl}/api/records/${secondRecordId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'ready' })
    });
    const notifiedTwice = await waitFor(() => mockWhatsapp.received.length === 2);
    assert(notifiedTwice, 'Un segundo record marcado ready dispara una segunda notificación independiente');

    // --- Caso 8.5: si el tenant tiene su propio delivery_whatsapp_number,
    // se usa ESE en vez del fallback global DELIVERY_WHATSAPP_NUMBER (ver
    // resolveDeliveryNumber en order-notifications.service.ts) ---
    const tenantOwnNumber = '+50699999999';
    await dbPool.query(`UPDATE tenants SET delivery_whatsapp_number = $1 WHERE id = $2`, [tenantOwnNumber, tenantId]);

    const thirdRecordRes = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        record_type: 'order',
        contact_identifier: '+50600000002',
        force_new: true,
        data: { items: ['pedido con repartidor propio del tenant'] }
      })
    });
    const thirdRecordBody = await thirdRecordRes.json();
    const thirdRecordId = thirdRecordBody.data.id;

    await fetch(`${baseUrl}/api/records/${thirdRecordId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'ready' })
    });
    const notifiedThrice = await waitFor(() => mockWhatsapp.received.length === 3);
    assert(notifiedThrice, 'Record con delivery_whatsapp_number propio del tenant también dispara notificación');
    assert(
      mockWhatsapp.received[2].telefono === tenantOwnNumber,
      `La notificación usa el número PROPIO del tenant, no el fallback de env var (recibido: ${mockWhatsapp.received[2].telefono})`
    );

    // --- Caso 9: 404 sobre un record inexistente ---
    const notFoundRes = await fetch(`${baseUrl}/api/records/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders
    });
    assert(notFoundRes.status === 404, `GET de un record inexistente devuelve 404 (recibido: ${notFoundRes.status})`);

    // El record del caso 4 (ventana expirada) quedó en status='received'
    // por defecto y nunca se tocó — hay que cerrarlo para que no cuente
    // como "en cola" y no ensucie el cálculo de estimateWaitMinutes.
    await dbPool.query(`UPDATE records SET status = 'completed' WHERE id = $1`, [expiredWindowBody.data.id]);

    // --- Caso 10: estimateWaitMinutes crece con la cola del mismo tenant ---
    // tenantId ya tiene, en este punto, records en status 'ready'/'completed'
    // (cerrados, no cuentan como cola) y ninguno 'received'/'in_progress'
    // propio — sembramos la cola a propósito para este caso.
    const baseEstimate = await estimateWaitMinutes(tenantId, '00000000-0000-0000-0000-000000000000');
    assert(baseEstimate === 10, `estimateWaitMinutes sin cola devuelve BASE_PREP_MINUTES=10 (recibido: ${baseEstimate})`);

    const queuedRecord1 = await dbPool.query(
      `INSERT INTO records (tenant_id, record_type, status) VALUES ($1, 'order', 'received') RETURNING id`,
      [tenantId]
    );
    const queuedRecord2 = await dbPool.query(
      `INSERT INTO records (tenant_id, record_type, status) VALUES ($1, 'order', 'in_progress') RETURNING id`,
      [tenantId]
    );
    const estimateWithQueue = await estimateWaitMinutes(tenantId, queuedRecord1.rows[0].id);
    // Se excluye queuedRecord1 (es "el propio pedido"), así que solo cuenta queuedRecord2 -> 10 + 1*5.
    assert(estimateWithQueue === 15, `estimateWaitMinutes con 1 pedido en cola (excluyendo el propio) devuelve 15 (recibido: ${estimateWithQueue})`);

    // --- Caso 11: la cola es por tenant, no global ---
    const otherTenantEstimate = await estimateWaitMinutes(otherTenantId, '00000000-0000-0000-0000-000000000000');
    assert(otherTenantEstimate === 10, `estimateWaitMinutes de un tenant sin pedidos propios no ve la cola de otro tenant (recibido: ${otherTenantEstimate})`);

    await dbPool.query('DELETE FROM records WHERE id = ANY($1::uuid[])', [[queuedRecord1.rows[0].id, queuedRecord2.rows[0].id]]);

    console.log('\n🎉 Todos los checks pasaron. El flujo de records + notifyDeliveryPerson() funciona de punta a punta contra la DB de test (sin tocar WhatsApp real).');
  } catch (error) {
    failed = true;
    console.error('\n💥 El test E2E falló:', error);
  } finally {
    server.close();
    await mockWhatsapp.close();
    await dbPool.end();
    redisClient.disconnect();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Error inesperado corriendo el test E2E:', error);
  process.exit(1);
});
