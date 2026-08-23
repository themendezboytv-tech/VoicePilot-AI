// ==============================================================================
// SERVICIO: Notificaciones de pedidos (repartidor + confirmación al cliente)
// Proyecto: VoicePilot AI
// Descripción: Dos piezas relacionadas pero independientes:
//  1) notifyDeliveryPerson(): avisa por WhatsApp cuando un record pasa a
//     status='ready' (record.controller.ts la dispara).
//  2) estimateWaitMinutes(): heurística simple de tiempo de espera según
//     cuántos pedidos reales hay en cola, usada por whatsapp.controller.ts
//     para la confirmación automática al cliente al cerrar un pedido.
// Ambas reusan sendWhatsappUnificadoMessage (misma integración provisoria
// de WhatsApp que ya existe) en vez de construir un canal nuevo — decisión
// tomada por ser la opción más simple de integrar hoy mismo, frente a
// construir desde cero una integración de Telegram para VoicePilot (el
// proceso wifi-hermano-telegram existente es de otro proyecto, no expone
// nada reutilizable acá). Documentado también en CLAUDE.md.
// ==============================================================================

import { dbPool } from '../config/database';
import { sendWhatsappUnificadoMessage } from './whatsapp-unificado.client';
import { RecordRow } from './record.service';

// Heurística de estimación DELIBERADAMENTE simple (MVP): un tiempo base de
// preparación para el pedido propio, más unos minutos extra por cada otro
// pedido que ya está en cola (received/in_progress) para el mismo tenant.
// No modela cocinas con capacidad distinta, pedidos con distinta
// complejidad, ni personal disponible — es un placeholder consciente,
// pensado para reemplazarse el día que haya datos reales de tiempos de
// preparación por tenant. Ver nota en CLAUDE.md.
const BASE_PREP_MINUTES = 10;
const MINUTES_PER_QUEUED_ORDER = 5;

// Statuses que cuentan como "en cola" (todavía no está listo ni se fue).
const QUEUED_STATUSES = ['received', 'in_progress'];

/**
 * Cuenta cuántos records del mismo tenant están en cola (sin contar el que
 * se acaba de crear) y devuelve una estimación en minutos. Ver constantes
 * arriba para la fórmula exacta.
 */
export async function estimateWaitMinutes(tenantId: string, excludeRecordId: string): Promise<number> {
  const result = await dbPool.query(
    `SELECT COUNT(*)::int AS n FROM records
     WHERE tenant_id = $1 AND status = ANY($2::varchar[]) AND id <> $3`,
    [tenantId, QUEUED_STATUSES, excludeRecordId]
  );

  const pendientesAdelante = result.rows[0].n as number;
  return BASE_PREP_MINUTES + pendientesAdelante * MINUTES_PER_QUEUED_ORDER;
}

/**
 * Texto para agregar a la respuesta del asistente cuando se confirma un
 * pedido — no reemplaza la respuesta de la IA, se le agrega al final.
 */
export function buildWaitEstimateSuffix(estimatedMinutes: number): string {
  return `Tiempo estimado: ~${estimatedMinutes} minutos.`;
}

const DELIVERY_WHATSAPP_NUMBER = process.env.DELIVERY_WHATSAPP_NUMBER || '';

/**
 * Le avisa al repartidor (un solo número configurado por ahora — mismo
 * espíritu provisorio que WHATSAPP_DEV_ALLOWED_NUMBER) que un pedido está
 * listo, con los datos que haya disponibles. Si DELIVERY_WHATSAPP_NUMBER
 * no está configurado, se loguea y no se hace nada — a diferencia de los
 * chequeos de auth del webhook, achá no hay motivo para fallar cerrado
 * (no es una superficie de ataque, es simplemente una notificación que
 * puede no estar configurada todavía).
 */
export async function notifyDeliveryPerson(record: RecordRow): Promise<void> {
  if (!DELIVERY_WHATSAPP_NUMBER) {
    console.warn('⚠️ DELIVERY_WHATSAPP_NUMBER no configurado: no se notifica al repartidor de que el pedido', record.id, 'está listo.');
    return;
  }

  const mensaje = armarMensajeRepartidor(record);

  try {
    await sendWhatsappUnificadoMessage(DELIVERY_WHATSAPP_NUMBER, mensaje);
  } catch (error) {
    // Un fallo notificando al repartidor no debe impedir que el pedido
    // quede marcado como "ready" — el status ya se guardó antes de llamar
    // a esta función.
    console.error('❌ Error notificando al repartidor por WhatsApp:', error);
  }
}

/**
 * Arma una frase legible en vez de una lista técnica clave: valor — pensada
 * para que un repartidor la lea de un vistazo en WhatsApp. No asume que
 * existan campos fijos como "dirección": data es JSONB libre y depende de
 * qué le haya preguntado el asistente al cliente, así que cada pieza se
 * agrega solo si está presente.
 *
 * "customer_name" se busca primero adentro de `data` porque así es como
 * conversation.service.ts/record-capture.service.ts guardan el nombre que
 * captura la IA — `record.contact_name` (la columna) casi siempre queda
 * null para records creados desde una conversación, solo se usa si alguien
 * lo cargó a mano (ej. vía la API).
 */
function armarMensajeRepartidor(record: RecordRow): string {
  const data = (record.data || {}) as Record<string, any>;

  const items = Array.isArray(data.items) && data.items.length > 0
    ? data.items.join(', ')
    : 'Pedido';

  const cliente = record.contact_name || data.customer_name || 'cliente sin nombre registrado';

  // Dirección + cualquier nota de entrega (puede venir en la columna
  // records.notes o adentro de data.notes, según cómo se haya creado el
  // record) — se combinan en una sola coletilla, ignorando lo que esté vacío.
  const detalles = [data.address, record.notes, data.notes].filter(
    (valor): valor is string => typeof valor === 'string' && valor.trim().length > 0
  );
  const coletilla = detalles.length > 0 ? `, ${detalles.join(', ')}` : '';

  const telefono = record.contact_identifier ? `. Tel: ${record.contact_identifier}` : '';

  return `📦 Nuevo pedido para entregar: ${items} — ${cliente}${coletilla}${telefono}`;
}
