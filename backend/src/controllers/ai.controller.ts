// ==============================================================================
// CONTROLADOR: AI Bot Interaction (Con Memoria Redis y Persistencia DB)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Request, Response } from 'express';
import { getAIProvider } from '../providers/ai';
import { dbPool } from '../config/database';
import { getChatHistory, saveChatHistory } from '../services/memory.service'; // 👈 Importamos la memoria
import { respondToDbError } from '../utils/db-errors';

export const handleAIBotInteraction = async (req: Request, res: Response) => {
  try {
    const { assistant_id, message, caller_number = '+34600000000' } = req.body;

    if (!assistant_id || !message) {
      return res.status(400).json({ error: 'Los parámetros assistant_id y message son obligatorios.' });
    }

    // 1. Obtener datos del asistente
    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, system_prompt, ai_provider FROM assistants WHERE id = $1',
      [assistant_id]
    );

    if (assistantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Asistente no encontrado en la base de datos.' });
    }

    const assistant = assistantResult.rows[0];

    // --- 🧠 2. RECUPERAR MEMORIA DE REDIS ---
    // Usamos el número de teléfono y el ID del asistente como clave única de sesión
    const sessionId = `${assistant_id}:${caller_number}`;
    const previousHistory = await getChatHistory(sessionId);

    // Inyectamos el historial al mensaje actual si existe
    let contextMessage = message;
    if (previousHistory) {
      contextMessage = `Este es el historial reciente de la conversación:\n${previousHistory}\n--- FIN DEL HISTORIAL ---\n\nResponde a este nuevo mensaje del cliente siguiendo el hilo de la conversación: "${message}"`;
    }

    // --- 🤖 3. GENERAR RESPUESTA CON EL PROVIDER DE IA CONFIGURADO ---
    // Cada asistente elige su motor (Gemini, OpenAI, ...) vía assistant.ai_provider
    const aiProvider = getAIProvider(assistant.ai_provider);
    const aiResponse = await aiProvider.generateResponse(assistant.system_prompt, contextMessage);

    // --- 💾 4. GUARDAR NUEVO CONTEXTO EN REDIS ---
    await saveChatHistory(sessionId, message, aiResponse);

    // --- 🗄️ 5. GUARDAR LLAMADA EN POSTGRESQL ---
    const transcript = `Cliente: ${message} - Asistente: ${aiResponse}`;
    
    const insertQuery = `
      INSERT INTO calls (tenant_id, assistant_id, caller_number, duration_seconds, status, transcript)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at;
    `;

    const newCall = await dbPool.query(insertQuery, [
      assistant.tenant_id,
      assistant.id,
      caller_number,
      15, // Duración estimada
      'completed',
      transcript
    ]);

    // 6. Responder al cliente
    return res.status(200).json({
      success: true,
      call_id: newCall.rows[0].id,
      assistant_name: assistant.name,
      user_message: message,
      ai_response: aiResponse,
      timestamp: newCall.rows[0].created_at
    });

  } catch (error: any) {
    // Los providers de IA lanzan Error con este prefijo cuando el motor
    // externo (Gemini/OpenAI) falla — es un problema del proveedor upstream,
    // no de nuestra base de datos, así que merece su propio código (502).
    if (typeof error?.message === 'string' && error.message.startsWith('Fallo en el motor de IA')) {
      console.error('❌ Error en controlador de IA (proveedor de IA):', error);
      return res.status(502).json({ error: 'El motor de IA no pudo generar una respuesta. Intenta de nuevo.' });
    }

    respondToDbError(error, res, 'Error interno al procesar la inteligencia artificial.');
  }
};