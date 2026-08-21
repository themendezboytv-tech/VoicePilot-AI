// ==============================================================================
// SERVICIO: Memoria de Contexto (Redis)
// Proyecto: VoicePilot AI
// Descripción: Gestiona el historial reciente de chat para mantener el contexto.
// ==============================================================================

import { redisClient } from '../config/redis';

const HISTORY_TTL = 3600; // El bot recordará la conversación durante 1 hora (en segundos)

/**
 * Obtiene el historial de conversación de un usuario específico.
 */
export const getChatHistory = async (sessionId: string): Promise<string> => {
  try {
    const history = await redisClient.get(`chat_history:${sessionId}`);
    return history || '';
  } catch (error) {
    console.error('❌ Error obteniendo historial de Redis:', error);
    return '';
  }
};

/**
 * Guarda el nuevo intercambio de mensajes en el historial del usuario.
 */
export const saveChatHistory = async (sessionId: string, userMsg: string, aiMsg: string): Promise<void> => {
  try {
    const currentHistory = await getChatHistory(sessionId);

    // Agregamos el nuevo intercambio
    const newEntry = `Cliente: ${userMsg}\nAsistente: ${aiMsg}\n\n`;
    let updatedHistory = currentHistory + newEntry;

    // Límite de seguridad: Guardamos solo los últimos ~2000 caracteres para no saturar los tokens de Gemini
    if (updatedHistory.length > 2000) {
      updatedHistory = updatedHistory.substring(updatedHistory.length - 2000);
    }

    // Guardamos en Redis con tiempo de expiración (TTL)
    await redisClient.setex(`chat_history:${sessionId}`, HISTORY_TTL, updatedHistory);
  } catch (error) {
    console.error('❌ Error guardando historial en Redis:', error);
  }
};
