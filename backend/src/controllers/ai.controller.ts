// ==============================================================================
// CONTROLADOR: AI Interaction
// Proyecto: VoicePilot AI
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { generateAssistantResponse } from '../services/gemini.service';

export const handleAIBotInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { assistant_id, message } = req.body;

    if (!assistant_id || !message) {
      res.status(400).json({ error: 'Faltan campos obligatorios (assistant_id, message)' });
      return;
    }

    const assistantResult = await dbPool.query(
      `SELECT * FROM assistants WHERE id = $1`,
      [assistant_id]
    );

    if (assistantResult.rowCount === 0) {
      res.status(404).json({ error: 'Asistente de IA no encontrado' });
      return;
    }

    const assistant = assistantResult.rows[0];

    // Llama al servicio usando el modelo predeterminado (gemini-2.5-flash)
    const aiResponseText = await generateAssistantResponse(
      assistant.system_prompt,
      message
    );

    res.status(200).json({
      success: true,
      assistant_name: assistant.name,
      user_message: message,
      ai_response: aiResponseText,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Error en controlador de IA:', error);
    res.status(500).json({ error: 'Error interno al procesar la inteligencia artificial' });
  }
};