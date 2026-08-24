// ==============================================================================
// SERVICIO: Captura de Records desde una conversación (voz hoy, otros
// canales a futuro)
// Proyecto: VoicePilot AI
// Descripción: Le agrega al prompt de un asistente "toma pedidos"
// (assistants.captures_records) instrucciones para que, al terminar de
// levantar un pedido/turno, devuelva un bloque de datos estructurados
// delimitado junto con su respuesta hablada normal — y separa ambas cosas
// de vuelta acá, para que el bloque JSON nunca se lea en voz alta.
// También resuelve el caso de continuidad entre canales: si el contacto ya
// tiene un record abierto reciente, en vez de crear uno nuevo automático,
// guarda el pedido "pendiente de confirmar" en Redis por unos minutos y le
// pide al modelo que le pregunte al cliente si es continuación o uno nuevo
// en el turno siguiente, reusando el mismo mecanismo de bloque delimitado.
// ==============================================================================

import { redisClient } from '../config/redis';

const RECORD_BLOCK_START = '<<<RECORD_DATA_START>>>';
const RECORD_BLOCK_END = '<<<RECORD_DATA_END>>>';

// Generosamente por encima de MAX_CALL_DURATION_MS (8 min) de
// telephony.controller.ts: solo necesita sobrevivir hasta el siguiente
// turno de la misma llamada, nunca entre llamadas distintas.
const PENDING_TTL_SECONDS = 600;

export const CONTINUITY_QUESTION =
  '¿Esto es una continuación de tu pedido o turno reciente que todavía está abierto, o es uno nuevo?';

export interface PendingContinuity {
  tenantId: string;
  assistantId: string;
  openRecordId: string;
  recordData: Record<string, unknown>;
}

/**
 * Instrucciones que se agregan al system_prompt de un asistente marcado
 * como captures_records. Van en español, como el resto de los prompts del
 * proyecto, y dejan explícito que el bloque JSON nunca debe leerse en voz
 * alta — la separación real la hace extractRecordData() del lado del código,
 * esto es solo la instrucción para que el modelo coopere.
 */
export function buildRecordCaptureInstructions(defaultRecordType: string): string {
  return `
INSTRUCCIONES ADICIONALES PARA CAPTURA DE PEDIDOS/TURNOS (nunca las menciones en voz alta):
Cuando ya reuniste toda la información necesaria para completar el pedido/turno del cliente,
agregá al FINAL de tu respuesta un bloque nuevo, en una línea aparte, con este formato exacto:
${RECORD_BLOCK_START}
{"record_type": "${defaultRecordType}", "customer_name": "...", "items": [...], "notes": "..."}
${RECORD_BLOCK_END}
Reglas:
- Lo que esté ANTES de "${RECORD_BLOCK_START}" es lo único que el cliente escucha: nunca leas
  el bloque ni menciones que existe.
- El contenido entre los delimitadores tiene que ser JSON válido, nada más.
- Si todavía falta información para completar el pedido/turno, no incluyas el bloque y seguí
  preguntando con normalidad.
- NUNCA preguntes vos por iniciativa propia si el pedido "es continuación de uno anterior" ni
  asumas que existe un pedido/turno previo. Esa pregunta SOLO tiene que aparecer si en este
  mismo mensaje recibís una instrucción explícita de contexto interno pidiéndotelo — si esa
  instrucción no está presente en este turno, tratá todo pedido como nuevo, sin mencionar ni
  inventar ningún pedido anterior. Nunca escribas frases como "sumado a tu pedido anterior" o
  "lo que ya teníamos pendiente" salvo que el sistema te haya dado esa información en este turno.
- Solo cuando SÍ recibas esa instrucción explícita de continuidad, incluí dentro del JSON el
  campo "is_continuation" (true o false), respondiendo según lo que diga el cliente.
- Preguntá UNA sola cosa por turno. Nunca combines varias preguntas en la misma respuesta,
  aunque falte más de un dato — priorizá la más importante y segui con las demás en turnos
  siguientes.
- Hablá como una persona real, no como un guion de call center: frases cortas, tono informal y
  cercano. Evitá frases hechas tipo "con mucho gusto" o "para poder avanzar".
`.trim();
}

/**
 * Instrucciones para el turno siguiente a haberle preguntado al cliente si
 * un pedido es continuación de uno abierto o nuevo. Se agregan al mensaje
 * del turno (no al system_prompt), igual que ya se hace con el historial
 * previo de Redis, para que el mismo llamado a Gemini de ese turno
 * interprete la respuesta sin necesitar una llamada extra al proveedor de IA.
 */
export function buildContinuityFollowUpInstructions(pending: PendingContinuity): string {
  return `
[Contexto interno, no lo menciones] Le preguntaste al cliente si su pedido/turno actual es
continuación del que ya tiene abierto (id ${pending.openRecordId}) o uno nuevo. Interpretá su
respuesta anterior y volvé a incluir el bloque de datos estructurados con el campo
"is_continuation": true o false según corresponda. Si es continuación, incluí también
"record_id": "${pending.openRecordId}" dentro del mismo JSON.
`.trim();
}

/**
 * Separa la respuesta hablada del bloque de datos estructurados. Si no hay
 * bloque, o el JSON adentro es inválido, devuelve la respuesta completa como
 * texto hablado y recordData en null — nunca revienta la llamada por esto.
 */
export function extractRecordData(rawResponse: string): {
  spokenReply: string;
  recordData: Record<string, any> | null;
} {
  const startIdx = rawResponse.indexOf(RECORD_BLOCK_START);
  const endIdx = rawResponse.indexOf(RECORD_BLOCK_END);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { spokenReply: rawResponse, recordData: null };
  }

  const spokenReply = rawResponse.slice(0, startIdx).trim();
  const jsonBlock = rawResponse.slice(startIdx + RECORD_BLOCK_START.length, endIdx).trim();

  try {
    return { spokenReply, recordData: JSON.parse(jsonBlock) };
  } catch (error) {
    console.error('❌ Bloque de datos estructurados con JSON inválido, se descarta y se usa solo la respuesta hablada:', error);
    return { spokenReply, recordData: null };
  }
}

// Campos de control que el modelo puede incluir en el JSON (record_type,
// is_continuation, record_id) pero que no son datos reales del pedido/turno
// y no deben quedar guardados dentro de records.data.
export function stripControlFields(recordData: Record<string, any>): Record<string, unknown> {
  const { record_type, is_continuation, record_id, ...rest } = recordData;
  return rest;
}

function pendingKey(sessionId: string): string {
  return `record_pending:${sessionId}`;
}

/**
 * Guarda el pedido/turno "pendiente de confirmar" (continuación vs. nuevo)
 * mientras se espera la respuesta del cliente en el próximo turno.
 */
export async function savePendingContinuity(sessionId: string, pending: PendingContinuity): Promise<void> {
  try {
    await redisClient.setex(pendingKey(sessionId), PENDING_TTL_SECONDS, JSON.stringify(pending));
  } catch (error) {
    console.error('❌ Error guardando estado pendiente de continuidad en Redis:', error);
  }
}

export async function getPendingContinuity(sessionId: string): Promise<PendingContinuity | null> {
  try {
    const raw = await redisClient.get(pendingKey(sessionId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('❌ Error leyendo estado pendiente de continuidad de Redis:', error);
    return null;
  }
}

export async function clearPendingContinuity(sessionId: string): Promise<void> {
  try {
    await redisClient.del(pendingKey(sessionId));
  } catch (error) {
    console.error('❌ Error limpiando estado pendiente de continuidad en Redis:', error);
  }
}
