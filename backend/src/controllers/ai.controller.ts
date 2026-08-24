// ==============================================================================
// CONTROLADOR: AI Bot Interaction (Con Memoria Redis y Persistencia DB)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import { runAssistantBrain } from '../services/conversation.service';

export const handleAIBotInteraction = async (req: Request, res: Response) => {
  try {
    const { assistant_id, message, caller_number = '+34600000000' } = req.body;

    if (!assistant_id || !message) {
      return res.status(400).json({ error: 'Los parámetros assistant_id y message son obligatorios.' });
    }

    // 1. Obtener datos del asistente
    const assistantResult = await dbPool.query(
      'SELECT id, tenant_id, name, system_prompt, ai_provider, captures_records, default_record_type FROM assistants WHERE id = $1',
      [assistant_id]
    );

    if (assistantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Asistente no encontrado en la base de datos.' });
    }

    const assistant = assistantResult.rows[0];

    // 2-5. Historial, IA, captura de records y log de la interacción: misma
    // secuencia que usa whatsapp.controller.ts (y, con su propia copia,
    // telephony.controller.ts). channel='web_chat' identifica a este canal
    // de texto — antes estas filas quedaban sin distinguir del canal de voz.
    const { reply, callId, createdAt } = await runAssistantBrain({
      assistant,
      contactIdentifier: caller_number,
      message,
      channel: 'web_chat'
    });

    // 6. Responder al cliente (mismo formato de siempre)
    return res.status(200).json({
      success: true,
      call_id: callId,
      assistant_name: assistant.name,
      user_message: message,
      ai_response: reply,
      timestamp: createdAt
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