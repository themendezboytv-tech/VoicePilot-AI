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

// Estas dos rutas están registradas específicamente como el webhook de
// Twilio (/api/telephony/twilio/*), así que antes de conocer el asistente
// (y por lo tanto su telephony_provider) solo tiene sentido interpretar el
// payload como Twilio. Una vez cargado el asistente, se resuelve el
// provider real vía assistant.telephony_provider.
const FALLBACK_PROVIDER_NAME = 'twilio';

const TWILIO_AUTH_TOKEN = process.env.TELEPHONY_AUTH_TOKEN || '';

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
    const gatherActionUrl = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistant.id}`;

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
  const gatherActionUrl = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistantId}`;

  try {
    const speech = fallbackProvider.parseSpeechResult(req.body);

    if (!speech.speechResult) {
      const response = fallbackProvider.buildReplyResponse('No te escuché bien, ¿puedes repetirlo?', gatherActionUrl);
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
      `INSERT INTO calls (tenant_id, assistant_id, caller_number, duration_seconds, status, transcript)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [assistant.tenant_id, assistant.id, speech.from, 0, 'in-progress', transcript]
    );

    const response = provider.buildReplyResponse(aiResponse, gatherActionUrl);
    res.type(response.contentType).send(response.body);
  } catch (error: any) {
    console.error(`❌ Error en webhook de resultado de voz [code=${error?.code ?? 'desconocido'}]:`, error);
    const response = fallbackProvider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
    res.type(response.contentType).send(response.body);
  }
};
