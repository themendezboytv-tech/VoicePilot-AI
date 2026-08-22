// ==============================================================================
// CONTROLADOR: Telephony Webhooks
// Proyecto: VoicePilot AI
// Descripción: Recibe los webhooks de llamadas entrantes reales y orquesta
// el flujo completo: llamada entra → voz a texto (a cargo del provider de
// telefonía) → IA → texto a voz (a cargo del provider de telefonía).
// ==============================================================================

import { Request, Response } from 'express';
import { validateRequest } from 'twilio';
import { dbPool } from '../config/database';
import { getTelephonyProvider } from '../providers/telephony';
import { getAIProvider } from '../providers/ai';
import { getChatHistory, saveChatHistory } from '../services/memory.service';
import { respondToDbError } from '../utils/db-errors';

// Estas dos rutas están registradas específicamente como el webhook de
// Twilio (/api/telephony/twilio/*), así que antes de conocer el asistente
// (y por lo tanto su telephony_provider) solo tiene sentido interpretar el
// payload como Twilio. Una vez cargado el asistente, se resuelve el
// provider real vía assistant.telephony_provider.
const FALLBACK_PROVIDER_NAME = 'twilio';

const TWILIO_AUTH_TOKEN = process.env.TELEPHONY_AUTH_TOKEN || '';

// Twilio no distingue "silencio total" de "habló pero el STT no transcribió
// nada" — con actionOnEmptyResult ambos casos llegan acá como SpeechResult
// vacío. En vez de reintentar para siempre, se cuenta cuántas veces
// consecutivas pasó esto (vía query param, no hay estado de llamada en DB
// todavía) y se corta con una despedida educada al superar el máximo.
const MAX_SILENCE_RETRIES = 1;

// Sin esto, una llamada podía seguir en loop indefinidamente (cada turno es
// una llamada nueva a Gemini, sin control de costo ni de duración real de
// la llamada en Twilio). No hay estado de llamada en DB para esto todavía,
// así que turno y hora de inicio viajan como query params en la propia
// action URL del Gather, igual que silence_retries.
const MAX_CALL_TURNS = 15;
const MAX_CALL_DURATION_MS = 8 * 60 * 1000; // 8 minutos

// Por debajo de esto, una transcripción se trata como no entendida en vez
// de mandarla a Gemini tal cual. undefined (proveedor no manda Confidence)
// no cuenta como baja: se sigue confiando en el texto como antes.
const MIN_SPEECH_CONFIDENCE = 0.5;

function buildBaseUrl(req: Request): string {
  // req.protocol respeta X-Forwarded-Proto gracias a app.set('trust proxy', true),
  // pero req.get('host') SIEMPRE lee el header Host crudo (Express no lo hace
  // proxy-aware). Si el proxy reescribe Host al hostname interno y reenvía el
  // público en X-Forwarded-Host, hay que preferir ese para que ambas mitades
  // de la URL reconstruida coincidan con lo que Twilio realmente firmó.
  const host = req.get('X-Forwarded-Host') || req.get('host');
  return `${req.protocol}://${host}`;
}

/**
 * Verifica la cabecera X-Twilio-Signature contra el auth token de la
 * cuenta, para asegurar que el webhook viene realmente de Twilio y no de
 * cualquiera que descubra la URL. Rechaza por defecto si no hay auth token
 * configurado (nunca hay que aceptar peticiones sin poder validarlas).
 */
function isValidTwilioSignature(req: Request): boolean {
  if (!TWILIO_AUTH_TOKEN) {
    console.warn('⚠️ TELEPHONY_AUTH_TOKEN no configurado: no se puede validar X-Twilio-Signature.');
    return false;
  }

  const signature = req.header('X-Twilio-Signature');
  if (!signature) {
    return false;
  }

  const fullUrl = `${buildBaseUrl(req)}${req.originalUrl}`;
  return validateRequest(TWILIO_AUTH_TOKEN, signature, fullUrl, req.body);
}

/**
 * Webhook de llamada entrante. Busca el asistente dueño del número marcado
 * y responde con un saludo + escucha de voz.
 * Método: POST /api/telephony/twilio/voice
 */
export const handleIncomingCall = async (req: Request, res: Response): Promise<void> => {
  if (!isValidTwilioSignature(req)) {
    console.warn('⚠️ Firma de Twilio inválida o ausente en /voice, petición rechazada.');
    res.status(403).send('Firma de Twilio inválida.');
    return;
  }

  const fallbackProvider = getTelephonyProvider(FALLBACK_PROVIDER_NAME);

  try {
    const call = fallbackProvider.parseIncomingCall(req.body);

    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, greeting_message, telephony_provider FROM assistants WHERE phone_number = $1',
      [call.to]
    );

    if (assistantResult.rows.length === 0) {
      console.warn(`⚠️ Llamada entrante a un número sin asistente configurado: ${call.to}`);
      const response = fallbackProvider.buildHangupResponse(
        'Lo sentimos, este número no tiene un asistente configurado todavía.'
      );
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistant = assistantResult.rows[0];
    const provider = getTelephonyProvider(assistant.telephony_provider);
    const gatherActionUrl = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistant.id}&turn=1&call_started_at=${Date.now()}`;

    const response = provider.buildGreetingResponse(
      assistant.greeting_message || `Hola, gracias por llamar a ${assistant.name}.`,
      gatherActionUrl
    );

    res.type(response.contentType).send(response.body);
  } catch (error: any) {
    console.error(`❌ Error en webhook de llamada entrante [code=${error?.code ?? 'desconocido'}]:`, error);
    const response = fallbackProvider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
    res.type(response.contentType).send(response.body);
  }
};

/**
 * Webhook de resultado de voz-a-texto de un turno de la conversación.
 * Genera la respuesta de la IA y vuelve a escuchar (loop conversacional).
 * Método: POST /api/telephony/twilio/gather?assistant_id=UUID
 */
export const handleSpeechResult = async (req: Request, res: Response): Promise<void> => {
  if (!isValidTwilioSignature(req)) {
    console.warn('⚠️ Firma de Twilio inválida o ausente en /gather, petición rechazada.');
    res.status(403).send('Firma de Twilio inválida.');
    return;
  }

  const fallbackProvider = getTelephonyProvider(FALLBACK_PROVIDER_NAME);
  const assistantId = req.query.assistant_id as string;
  const baseGatherPath = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistantId}`;
  const silenceRetries = parseInt(req.query.silence_retries as string, 10) || 0;
  // `turn` solo cuenta intercambios reales con la IA — un silencio reintenta
  // sin consumir turno (ver más abajo). Si faltan (llamada armada antes de
  // este cambio, o payload manipulado), se asume recién empezando/ahora.
  const turn = parseInt(req.query.turn as string, 10) || 1;
  const callStartedAt = parseInt(req.query.call_started_at as string, 10) || Date.now();

  try {
    const elapsedMs = Date.now() - callStartedAt;

    if (turn > MAX_CALL_TURNS || elapsedMs > MAX_CALL_DURATION_MS) {
      console.warn(`⚠️ Límite de llamada alcanzado (turno ${turn}/${MAX_CALL_TURNS}, ${Math.round(elapsedMs / 1000)}s/${MAX_CALL_DURATION_MS / 1000}s), se cuelga.`);
      const response = fallbackProvider.buildHangupResponse(
        'Hemos llegado al límite de esta llamada. Si necesitás más ayuda, por favor volvé a llamarnos. ¡Gracias por tu paciencia!'
      );
      res.type(response.contentType).send(response.body);
      return;
    }

    const speech = fallbackProvider.parseSpeechResult(req.body);
    const lowConfidence = speech.confidence !== undefined && speech.confidence < MIN_SPEECH_CONFIDENCE;

    if (!speech.speechResult || lowConfidence) {
      if (lowConfidence) {
        console.warn(`⚠️ Transcripción con confianza baja (${speech.confidence}) descartada: "${speech.speechResult}"`);
      }

      if (silenceRetries >= MAX_SILENCE_RETRIES) {
        console.warn(`⚠️ Sin audio útil del llamante tras ${silenceRetries + 1} intentos (silencio o confianza baja), se cuelga la llamada.`);
        const response = fallbackProvider.buildHangupResponse(
          'No logré escucharte. Vamos a finalizar la llamada por ahora, ¡que tengas un buen día!'
        );
        res.type(response.contentType).send(response.body);
        return;
      }

      // Mismo `turn` (el silencio no consume turno) + silence_retries
      // incrementado, en vez de sobre gatherActionUrl base (definida abajo
      // con turn+1) para no mezclar los dos contadores.
      const retryGatherUrl = `${baseGatherPath}&turn=${turn}&call_started_at=${callStartedAt}&silence_retries=${silenceRetries + 1}`;
      const response = fallbackProvider.buildReplyResponse(
        'No te escuché bien, ¿sigues ahí? Por favor repite tu mensaje.',
        retryGatherUrl
      );
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, system_prompt, ai_provider, telephony_provider FROM assistants WHERE id = $1',
      [assistantId]
    );

    if (assistantResult.rows.length === 0) {
      const response = fallbackProvider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistant = assistantResult.rows[0];
    const provider = getTelephonyProvider(assistant.telephony_provider);

    // Misma clave de sesión que usa el canal de texto (/api/ai/chat), así
    // ambos canales comparten el historial reciente de un mismo cliente.
    const sessionId = `${assistant.id}:${speech.from}`;
    const previousHistory = await getChatHistory(sessionId);

    let contextMessage = speech.speechResult;
    if (previousHistory) {
      contextMessage = `Este es el historial reciente de la conversación:\n${previousHistory}\n--- FIN DEL HISTORIAL ---\n\nResponde a este nuevo mensaje del cliente siguiendo el hilo de la conversación: "${speech.speechResult}"`;
    }

    const aiProvider = getAIProvider(assistant.ai_provider);
    const aiResponse = await aiProvider.generateResponse(assistant.system_prompt, contextMessage);

    await saveChatHistory(sessionId, speech.speechResult, aiResponse);

    const transcript = `Cliente: ${speech.speechResult} - Asistente: ${aiResponse}`;
    await dbPool.query(
      `INSERT INTO calls (tenant_id, assistant_id, caller_number, call_sid, duration_seconds, status, transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [assistant.tenant_id, assistant.id, speech.from, speech.callSid, 0, 'in-progress', transcript]
    );

    const nextGatherUrl = `${baseGatherPath}&turn=${turn + 1}&call_started_at=${callStartedAt}`;
    const response = provider.buildReplyResponse(aiResponse, nextGatherUrl);
    res.type(response.contentType).send(response.body);
  } catch (error: any) {
    console.error(`❌ Error en webhook de resultado de voz [code=${error?.code ?? 'desconocido'}]:`, error);
    const response = fallbackProvider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
    res.type(response.contentType).send(response.body);
  }
};

// Estados terminales de una llamada según Twilio. Los intermedios (queued,
// ringing, in-progress) no cierran nada todavía — solo se acusa recibo.
const TERMINAL_CALL_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

/**
 * Webhook de cambios de estado de la llamada (Call Status Changes). Se
 * configura a nivel del número de Twilio, no por turno, y dispara una vez
 * que la llamada termina de verdad. Cierra el status/duration reales de
 * todas las filas de `calls` que pertenecen a este CallSid — hoy cada
 * turno conversacional es su propia fila, así que esto actualiza todas
 * las filas de la llamada al mismo status/duration final en vez de dejarlas
 * en 'in-progress'/0 para siempre.
 * A diferencia de /voice y /gather, esta ruta no le da forma al flujo de la
 * llamada (Twilio no espera TwiML acá), así que responde JSON como el
 * resto de los controllers, vía respondToDbError.
 * Método: POST /api/telephony/twilio/status
 */
export const handleCallStatus = async (req: Request, res: Response): Promise<void> => {
  if (!isValidTwilioSignature(req)) {
    console.warn('⚠️ Firma de Twilio inválida o ausente en /status, petición rechazada.');
    res.status(403).json({ error: 'Firma de Twilio inválida.' });
    return;
  }

  const callSid = req.body.CallSid as string | undefined;
  const callStatus = req.body.CallStatus as string | undefined;
  const callDuration = parseInt(req.body.CallDuration as string, 10) || 0;

  if (!callSid || !callStatus) {
    res.status(400).json({ error: 'Falta CallSid o CallStatus en el payload.' });
    return;
  }

  if (!TERMINAL_CALL_STATUSES.has(callStatus)) {
    res.status(204).send();
    return;
  }

  try {
    const result = await dbPool.query(
      'UPDATE calls SET status = $1, duration_seconds = $2 WHERE call_sid = $3',
      [callStatus, callDuration, callSid]
    );
    console.log(`📞 Llamada ${callSid} finalizada con status="${callStatus}" (${callDuration}s) — ${result.rowCount} turno(s) actualizados.`);
    res.status(204).send();
  } catch (error: any) {
    respondToDbError(error, res, 'No se pudo actualizar el estado de la llamada.');
  }
};
