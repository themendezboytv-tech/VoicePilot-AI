// ==============================================================================
// CONTROLADOR: Telephony Webhooks
// Proyecto: VoicePilot AI
// Descripción: Recibe los webhooks de llamadas entrantes reales y orquesta
// el flujo completo: llamada entra → voz a texto (a cargo del provider de
// telefonía) → IA → texto a voz (a cargo del provider de telefonía).
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { getTelephonyProvider } from '../providers/telephony';
import { getAIProvider } from '../providers/ai';
import { getChatHistory, saveChatHistory } from '../services/memory.service';

// Único proveedor de telefonía real implementado hasta ahora.
// Cuando exista más de uno, esto debería resolverse por Tenant/Assistant
// igual que ai_provider, en vez de estar fijo por endpoint.
const PROVIDER_NAME = 'twilio';

function buildBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * Webhook de llamada entrante. Busca el asistente dueño del número marcado
 * y responde con un saludo + escucha de voz.
 * Método: POST /api/telephony/twilio/voice
 */
export const handleIncomingCall = async (req: Request, res: Response): Promise<void> => {
  const provider = getTelephonyProvider(PROVIDER_NAME);

  try {
    const call = provider.parseIncomingCall(req.body);

    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, greeting_message FROM assistants WHERE phone_number = $1',
      [call.to]
    );

    if (assistantResult.rows.length === 0) {
      console.warn(`⚠️ Llamada entrante a un número sin asistente configurado: ${call.to}`);
      const response = provider.buildHangupResponse(
        'Lo sentimos, este número no tiene un asistente configurado todavía.'
      );
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistant = assistantResult.rows[0];
    const gatherActionUrl = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistant.id}`;

    const response = provider.buildGreetingResponse(
      assistant.greeting_message || `Hola, gracias por llamar a ${assistant.name}.`,
      gatherActionUrl
    );

    res.type(response.contentType).send(response.body);
  } catch (error: any) {
    console.error('❌ Error en webhook de llamada entrante:', error);
    const response = provider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
    res.type(response.contentType).send(response.body);
  }
};

/**
 * Webhook de resultado de voz-a-texto de un turno de la conversación.
 * Genera la respuesta de la IA y vuelve a escuchar (loop conversacional).
 * Método: POST /api/telephony/twilio/gather?assistant_id=UUID
 */
export const handleSpeechResult = async (req: Request, res: Response): Promise<void> => {
  const provider = getTelephonyProvider(PROVIDER_NAME);
  const assistantId = req.query.assistant_id as string;
  const gatherActionUrl = `${buildBaseUrl(req)}/api/telephony/twilio/gather?assistant_id=${assistantId}`;

  try {
    const speech = provider.parseSpeechResult(req.body);

    if (!speech.speechResult) {
      const response = provider.buildReplyResponse('No te escuché bien, ¿puedes repetirlo?', gatherActionUrl);
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, system_prompt, ai_provider FROM assistants WHERE id = $1',
      [assistantId]
    );

    if (assistantResult.rows.length === 0) {
      const response = provider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
      res.type(response.contentType).send(response.body);
      return;
    }

    const assistant = assistantResult.rows[0];

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
    console.error('❌ Error en webhook de resultado de voz:', error);
    const response = provider.buildHangupResponse('Ocurrió un error interno. Por favor, intenta más tarde.');
    res.type(response.contentType).send(response.body);
  }
};
