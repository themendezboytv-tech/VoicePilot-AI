// ==============================================================================
// CONTROLADOR: WhatsApp (INTEGRACIÓN PROVISORIA — un solo número compartido)
// Proyecto: VoicePilot AI
// Descripción: Recibe mensajes entrantes que whatsapp-unificado reenvía acá
// (un solo número de WhatsApp personal, no multi-tenant todavía — ver
// comentario en services/whatsapp-unificado.client.ts), los procesa con el
// mismo "cerebro" que usa el canal de texto (conversation.service.ts:
// mismo system_prompt/ai_provider por asistente, misma captura de records
// y continuidad cross-channel) y devuelve la respuesta a través de
// whatsapp-unificado al mismo contacto.
//
// WHATSAPP_DEV_ASSISTANT_ID (env var) es, a propósito, EL ÚNICO asistente
// que este canal atiende por ahora: como hay un solo número compartido, no
// tiene sentido rutear por número (a diferencia de voz, que rutea por
// assistants.phone_number). El nombre de la variable deja explícito que es
// una configuración de desarrollo/pruebas, para que sea fácil de encontrar
// y reemplazar cuando exista WhatsApp multi-tenant de verdad.
//
// WHATSAPP_DEV_ALLOWED_NUMBER (env var, también temporal) restringe
// además QUIÉN puede hablar con ese asistente: cualquier remitente
// distinto se ignora en silencio (sin respuesta, sin crear records).
//
// Guarda de idempotencia: el 2026-08-23 se detectó en producción un caso
// real de mensaje entrante duplicado (mismo texto, mismo contacto, pocos
// minutos de diferencia) causado por reconexiones de Baileys en
// whatsapp-unificado — WhatsApp reenvía un mensaje no confirmado tras
// reconectar. No generó dos records (la ejecución duplicada nunca llegó a
// completarse del todo), pero para no depender de esa suerte, se ignora
// explícitamente el mismo texto del mismo contacto si llega de nuevo
// dentro de un ventana corta.
// ==============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { dbPool } from '../config/database';
import { redisClient } from '../config/redis';
import { respondToDbError } from '../utils/db-errors';
import { runAssistantBrain } from '../services/conversation.service';
import { sendWhatsappUnificadoMessage } from '../services/whatsapp-unificado.client';

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const DEV_ASSISTANT_ID = process.env.WHATSAPP_DEV_ASSISTANT_ID || '';
// Restricción adicional, también temporal: mientras el canal sea un solo
// número compartido, solo este remitente recibe respuesta. Falla cerrado
// a propósito (igual que WEBHOOK_SECRET) — si no está configurado, no se
// le contesta a nadie en vez de contestarle a cualquiera.
const ALLOWED_NUMBER = process.env.WHATSAPP_DEV_ALLOWED_NUMBER || '';

/**
 * whatsapp-unificado manda el remitente como JID de Baileys
 * (ej. "34600111222@s.whatsapp.net") o como número simple, según el
 * llamador. Nos quedamos solo con la parte numérica para usarla como
 * contact_identifier — consistente con lo que ya guarda records/calls para
 * el canal de voz (un número de teléfono, sin sufijos de protocolo).
 */
function normalizeContact(jidOrPhone: string): string {
  return jidOrPhone.split('@')[0];
}

// Compara solo dígitos, así "+34 631 46 96 14" (como lo escribiría una
// persona en WHATSAPP_DEV_ALLOWED_NUMBER) matchea contra el
// contactIdentifier ya normalizado (sin +, sin espacios).
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Ventana de idempotencia: lo suficientemente corta para no bloquear un
// segundo pedido legítimo del mismo contacto, y lo suficientemente larga
// para cubrir el reenvío por reconexión de Baileys que se vio en
// producción (unos pocos minutos entre reintentos, en el peor caso visto).
const DEDUP_WINDOW_SECONDS = 60;

/**
 * true si el mismo contacto ya mandó este mismo texto exacto hace menos de
 * DEDUP_WINDOW_SECONDS. Usa SET ... NX (set solo si no existe) para que el
 * chequeo-y-marcado sea atómico — dos requests casi simultáneas no pueden
 * pasar ambas como "no duplicada".
 */
async function esMensajeDuplicado(contactIdentifier: string, text: string): Promise<boolean> {
  try {
    const hash = crypto.createHash('sha1').update(text).digest('hex');
    const key = `whatsapp_dedup:${contactIdentifier}:${hash}`;
    const resultado = await redisClient.set(key, '1', 'EX', DEDUP_WINDOW_SECONDS, 'NX');
    return resultado !== 'OK';
  } catch (error) {
    console.error('❌ Error chequeando duplicado de WhatsApp en Redis:', error);
    return false; // ante la duda de Redis, no bloqueamos el mensaje
  }
}

/**
 * Webhook que whatsapp-unificado llama por cada mensaje entrante que no
 * matchea ninguno de sus propios comandos (!ping, !programar, etc.) — ver
 * la propuesta de cambio en whatsapp-unificado documentada aparte, todavía
 * no aplicada. Body esperado: { from: string, text: string }.
 * Método: POST /api/whatsapp/webhook
 */
export const handleWhatsappInbound = async (req: Request, res: Response): Promise<void> => {
  if (!WEBHOOK_SECRET || req.header('X-Webhook-Secret') !== WEBHOOK_SECRET) {
    console.warn('⚠️ Webhook de WhatsApp llamado sin secreto válido, petición rechazada.');
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { from, text } = req.body || {};
  if (!from || !text) {
    res.status(400).json({ error: 'Faltan los campos from o text' });
    return;
  }

  if (!DEV_ASSISTANT_ID) {
    console.warn('⚠️ WHATSAPP_DEV_ASSISTANT_ID no configurado: el canal de WhatsApp todavía no tiene asistente asignado.');
    res.status(503).json({ error: 'El canal de WhatsApp no está configurado todavía' });
    return;
  }

  try {
    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, system_prompt, ai_provider, captures_records, default_record_type FROM assistants WHERE id = $1',
      [DEV_ASSISTANT_ID]
    );

    if (assistantResult.rows.length === 0) {
      console.error(`❌ WHATSAPP_DEV_ASSISTANT_ID (${DEV_ASSISTANT_ID}) no corresponde a ningún asistente existente.`);
      res.status(503).json({ error: 'El asistente configurado para WhatsApp no existe' });
      return;
    }

    const assistant = assistantResult.rows[0];
    const contactIdentifier = normalizeContact(from);

    // Se ignora en silencio (sin respuesta, sin tocar records) a cualquier
    // remitente que no sea el número permitido — mismo tratamiento que ya
    // reciben los mensajes fromMe del lado de whatsapp-unificado.
    if (!ALLOWED_NUMBER || soloDigitos(contactIdentifier) !== soloDigitos(ALLOWED_NUMBER)) {
      console.warn(`⚠️ Mensaje de WhatsApp ignorado: remitente ${contactIdentifier} no es WHATSAPP_DEV_ALLOWED_NUMBER.`);
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (await esMensajeDuplicado(contactIdentifier, text)) {
      console.warn(`⚠️ Mensaje de WhatsApp duplicado ignorado (mismo texto de ${contactIdentifier} dentro de ${DEDUP_WINDOW_SECONDS}s).`);
      res.status(200).json({ ok: true, ignored: true, reason: 'duplicate' });
      return;
    }

    const { reply } = await runAssistantBrain({
      assistant,
      contactIdentifier,
      message: text,
      channel: 'whatsapp'
    });

    try {
      await sendWhatsappUnificadoMessage(contactIdentifier, reply);
    } catch (sendError) {
      // La interacción (y el record, si correspondía) ya quedaron
      // guardados en DB/Redis aunque el envío falle acá — el estado queda
      // consistente para el próximo mensaje, solo que este turno el
      // contacto no recibe respuesta.
      console.error('❌ Error enviando la respuesta a whatsapp-unificado:', sendError);
    }

    res.status(200).json({ ok: true, reply });
  } catch (error) {
    respondToDbError(error, res, 'Error interno procesando el mensaje de WhatsApp');
  }
};
