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
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import { runAssistantBrain } from '../services/conversation.service';
import { sendWhatsappUnificadoMessage } from '../services/whatsapp-unificado.client';

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const DEV_ASSISTANT_ID = process.env.WHATSAPP_DEV_ASSISTANT_ID || '';

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
