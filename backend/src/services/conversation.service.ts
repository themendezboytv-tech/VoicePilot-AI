// ==============================================================================
// SERVICIO: Cerebro del asistente (canal-agnóstico)
// Proyecto: VoicePilot AI
// Descripción: Extrae la secuencia que ai.controller.ts (texto) y ahora
// whatsapp.controller.ts (WhatsApp) ejecutan igual: traer historial de
// Redis → armar el contexto → llamar al provider de IA del asistente →
// separar/capturar datos estructurados de records (si el asistente los
// captura) → resolver continuidad cross-channel → loguear la interacción en
// `calls` → guardar el nuevo historial. Usa contact_identifier de forma
// genérica (no caller_number): puede ser un número de teléfono, un JID de
// WhatsApp, o cualquier identificador de contacto futuro.
//
// telephony.controller.ts (voz) NO usa este servicio — mantiene su propia
// copia de esta misma secuencia. Es una duplicación deliberada: ese archivo
// está fuera de alcance para modificar (flujo de llamadas ya estabilizado
// en producción), así que en vez de arriesgar tocarlo para que reuse esto,
// se dejó como está. Si en el futuro se decide unificarlo también, es un
// cambio aparte y explícito, no un efecto colateral de este refactor.
// ==============================================================================

import { dbPool } from '../config/database';
import { getAIProvider } from '../providers/ai';
import { getChatHistory, saveChatHistory } from './memory.service';
import { findOpenRecordForContact, createRecord, appendRecordData } from './record.service';
import {
  buildRecordCaptureInstructions,
  buildContinuityFollowUpInstructions,
  extractRecordData,
  stripControlFields,
  getPendingContinuity,
  savePendingContinuity,
  clearPendingContinuity,
  CONTINUITY_QUESTION,
  PendingContinuity
} from './record-capture.service';

export interface AssistantForBrain {
  id: string;
  tenant_id: string;
  system_prompt: string;
  ai_provider: string;
  captures_records: boolean;
  default_record_type: string | null;
}

export interface RunAssistantBrainParams {
  assistant: AssistantForBrain;
  // Identificador genérico del contacto: número de teléfono para voz/WhatsApp
  // hoy, cualquier otra cosa mañana. Nunca "caller_number" acá — ese nombre
  // queda como detalle interno de la tabla `calls` (heredado de la época en
  // que solo existía voz), no como concepto de esta capa.
  contactIdentifier: string;
  message: string;
  // Canal de origen de esta interacción (voice, whatsapp, web_chat...). Se
  // guarda tal cual en calls.channel y, si corresponde, en records.channel.
  channel: string;
}

// Qué terminó pasando con el record en este turno, para que el llamador
// (ej. whatsapp.controller.ts, para la confirmación con tiempo estimado)
// pueda reaccionar sin tener que reconsultar la DB ni duplicar la lógica
// de decisión que ya vive acá.
export type RecordOutcome = 'created' | 'appended' | 'pending' | 'discarded' | null;

export interface RunAssistantBrainResult {
  // Respuesta final que hay que mandarle al contacto (ya sin el bloque de
  // datos estructurados, y con la pregunta de continuidad agregada si
  // corresponde).
  reply: string;
  callId: string;
  createdAt: string;
  // Datos estructurados que la IA devolvió en este turno, si los hay — se
  // expone por si el llamador quiere loguearlo o inspeccionarlo, pero
  // record.service.ts/record-capture.service.ts ya se encargaron de
  // crear/actualizar el record correspondiente.
  recordData: Record<string, unknown> | null;
  recordOutcome: RecordOutcome;
  // id del record creado/actualizado este turno (null si no hubo ninguno).
  recordId: string | null;
  // tenant_id del asistente, para no obligar al llamador a volver a
  // buscarlo si necesita hacer algo más con el record (ej. estimar tiempo
  // de espera contando otros pedidos del mismo tenant).
  tenantId: string;
}

/**
 * Corre la secuencia completa del "cerebro" del asistente para un mensaje
 * de un contacto, sin importar el canal. Ver el comentario de cabecera del
 * archivo para el detalle de qué hace cada paso.
 */
export async function runAssistantBrain(params: RunAssistantBrainParams): Promise<RunAssistantBrainResult> {
  const { assistant, contactIdentifier, message, channel } = params;

  // Misma clave de sesión que ya se usaba entre voz y texto, ahora también
  // para WhatsApp — así un mismo contacto comparte historial reciente sin
  // importar por dónde escribió.
  const sessionId = `${assistant.id}:${contactIdentifier}`;
  const previousHistory = await getChatHistory(sessionId);

  let contextMessage = message;
  if (previousHistory) {
    contextMessage = `Este es el historial reciente de la conversación:\n${previousHistory}\n--- FIN DEL HISTORIAL ---\n\nResponde a este nuevo mensaje del cliente siguiendo el hilo de la conversación: "${message}"`;
  }

  // --- Captura de records: aditivo, solo aplica a asistentes marcados con
  // captures_records. Mismo mecanismo que ya usa telephony.controller.ts
  // (prompt aumentado + bloque delimitado + estado pendiente en Redis).
  let effectiveSystemPrompt = assistant.system_prompt;
  let pendingContinuity: PendingContinuity | null = null;

  if (assistant.captures_records) {
    effectiveSystemPrompt = `${assistant.system_prompt}\n\n${buildRecordCaptureInstructions(assistant.default_record_type || 'order')}`;

    pendingContinuity = await getPendingContinuity(sessionId);
    if (pendingContinuity) {
      contextMessage = `${contextMessage}\n\n${buildContinuityFollowUpInstructions(pendingContinuity)}`;
    }
  }

  const aiProvider = getAIProvider(assistant.ai_provider);
  const aiResponse = await aiProvider.generateResponse(effectiveSystemPrompt, contextMessage);

  let spokenReply = aiResponse;
  let recordData: Record<string, any> | null = null;

  if (assistant.captures_records) {
    const extracted = extractRecordData(aiResponse);
    spokenReply = extracted.spokenReply;
    recordData = extracted.recordData;
  }

  // Se loguea la interacción ANTES de resolver records para poder usar el
  // id de esta fila como interaction_id del record que se cree — algo que
  // el flujo de voz no puede hacer sin reordenar telephony.controller.ts
  // (fuera de alcance), pero acá sí, porque es código nuevo.
  const transcript = `Cliente: ${message} - Asistente: ${spokenReply}`;
  const callResult = await dbPool.query(
    `INSERT INTO calls (tenant_id, assistant_id, caller_number, channel, duration_seconds, status, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [assistant.tenant_id, assistant.id, contactIdentifier, channel, 0, 'completed', transcript]
  );
  const callId = callResult.rows[0].id;
  const createdAt = callResult.rows[0].created_at;

  // La respuesta que efectivamente se le manda al contacto puede diferir
  // del transcript (por ejemplo, si se le agrega la pregunta de
  // continuidad) — finalReply es esa versión final, spokenReply/transcript
  // reflejan lo que la IA realmente generó ese turno.
  let finalReply = spokenReply;
  let recordOutcome: RecordOutcome = null;
  let recordId: string | null = null;

  if (recordData) {
    try {
      if (pendingContinuity) {
        // Ya le habíamos preguntado al contacto en el turno anterior si
        // esto era continuación de un record abierto o uno nuevo.
        if (recordData.is_continuation === true) {
          const updated = await appendRecordData(pendingContinuity.openRecordId, stripControlFields(recordData));
          recordOutcome = 'appended';
          recordId = updated?.id ?? pendingContinuity.openRecordId;
        } else if (recordData.is_continuation === false) {
          const created = await createRecord({
            tenantId: assistant.tenant_id,
            assistantId: assistant.id,
            interactionId: callId,
            recordType: recordData.record_type || assistant.default_record_type || 'order',
            channel,
            contactIdentifier,
            data: stripControlFields(recordData)
          });
          recordOutcome = 'created';
          recordId = created.id;
        } else {
          // El modelo no aclaró is_continuation pese a la instrucción: no
          // adivinamos, se descarta este intento en vez de crear/actualizar
          // algo incorrecto.
          console.warn('⚠️ Respuesta de continuidad de record sin is_continuation claro, se descarta.');
          recordOutcome = 'discarded';
        }
        await clearPendingContinuity(sessionId);
      } else {
        const openRecord = await findOpenRecordForContact(assistant.tenant_id, contactIdentifier);

        if (openRecord) {
          // No se crea nada todavía: se guarda el pedido pendiente y se le
          // pide al contacto que confirme en el próximo turno. Funciona
          // igual sin importar si ese record abierto se creó por voz,
          // WhatsApp o cualquier otro canal — findOpenRecordForContact no
          // filtra por channel a propósito.
          await savePendingContinuity(sessionId, {
            tenantId: assistant.tenant_id,
            assistantId: assistant.id,
            openRecordId: openRecord.id,
            recordData
          });
          finalReply = `${finalReply} ${CONTINUITY_QUESTION}`;
          recordOutcome = 'pending';
        } else {
          const created = await createRecord({
            tenantId: assistant.tenant_id,
            assistantId: assistant.id,
            interactionId: callId,
            recordType: recordData.record_type || assistant.default_record_type || 'order',
            channel,
            contactIdentifier,
            data: stripControlFields(recordData)
          });
          recordOutcome = 'created';
          recordId = created.id;
        }
      }
    } catch (recordError) {
      // Un fallo guardando el record no debe cortar la conversación: el
      // contacto igual recibe una respuesta.
      console.error('❌ Error al procesar datos estructurados de record:', recordError);
    }
  }

  await saveChatHistory(sessionId, message, finalReply);

  return { reply: finalReply, callId, createdAt, recordData, recordOutcome, recordId, tenantId: assistant.tenant_id };
}
