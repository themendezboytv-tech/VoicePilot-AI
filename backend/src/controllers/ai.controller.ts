// ==============================================================================
// CONTROLADOR: AI Bot Interaction
// Proyecto: VoicePilot AI
// ==============================================================================

import { Request, Response } from 'express';
import { generateAssistantResponse } from '../services/gemini.service';
import { dbPool } from '../config/database'; // 👈 Importamos dbPool correctamente

export const handleAIBotInteraction = async (req: Request, res: Response) => {
  try {
    const { assistant_id, message, caller_number = '+34600000000' } = req.body;

    // Validación de entrada
    if (!assistant_id || !message) {
      return res.status(400).json({ 
        error: 'Los parámetros assistant_id y message son obligatorios.' 
      });
    }

    // 1. Obtener la información del asistente y tenant desde PostgreSQL
    const assistantResult = await dbPool.query( // 👈 Usamos dbPool
      'SELECT id, tenant_id, name, system_prompt FROM assistants WHERE id = $1',
      [assistant_id]
    );

    if (assistantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Asistente no encontrado en la base de datos.' });
    }

    const assistant = assistantResult.rows[0];

    // 2. Generar la respuesta contextual con el motor Gemini
    const aiResponse = await generateAssistantResponse(assistant.system_prompt, message);

    // 3. Formatear la transcripción según el formato de la base de datos
    const transcript = `Cliente: ${message} - Asistente: ${aiResponse}`;

    // 4. Guardar la llamada/interacción en la tabla calls
    const insertQuery = `
      INSERT INTO calls (tenant_id, assistant_id, caller_number, duration_seconds, status, transcript)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at;
    `;

    const newCall = await dbPool.query(insertQuery, [ // 👈 Usamos dbPool
      assistant.tenant_id,
      assistant.id,
      caller_number,
      15, // Duración estimada
      'completed',
      transcript
    ]);

    // 5. Responder al cliente con confirmación e ID de registro
    return res.status(200).json({
      success: true,
      call_id: newCall.rows[0].id,
      assistant_name: assistant.name,
      user_message: message,
      ai_response: aiResponse,
      timestamp: newCall.rows[0].created_at
    });

  } catch (error: any) {
    console.error('❌ Error en controlador de IA:', error);
    return res.status(500).json({ 
      error: 'Error interno al procesar la inteligencia artificial.',
      details: error.message 
    });
  }
};