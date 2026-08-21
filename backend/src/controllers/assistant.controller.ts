// ==============================================================================
// CONTROLADOR: Assistants (Asistentes de IA)
// Proyecto: VoicePilot AI
// Descripción: Gestiona la lógica para crear y consultar los bots de voz.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';

/**
 * Crea un nuevo Asistente Telefónico
 * Método: POST /api/assistants
 */
export const createAssistant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenant_id, name, system_prompt, greeting_message, voice_id, phone_number, ai_provider, telephony_provider } = req.body;

    // Validación básica: Necesitamos saber a qué empresa pertenece y sus instrucciones
    if (!tenant_id || !name || !system_prompt || !greeting_message) {
      res.status(400).json({
        error: 'Faltan campos obligatorios (tenant_id, name, system_prompt, greeting_message)'
      });
      return;
    }

    // Insertar en PostgreSQL y devolver el registro creado
    const result = await dbPool.query(
      `INSERT INTO assistants (tenant_id, name, system_prompt, greeting_message, voice_id, phone_number, ai_provider, telephony_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenant_id,
        name,
        system_prompt,
        greeting_message,
        voice_id || 'default',
        phone_number || null,
        ai_provider || 'gemini',
        telephony_provider || 'twilio'
      ]
    );

    res.status(201).json({
      message: 'Asistente de IA creado exitosamente',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('❌ Error al crear asistente:', error);
    res.status(500).json({ error: 'Error interno del servidor al crear el asistente' });
  }
};

/**
 * Obtiene la lista de asistentes (puede filtrar por empresa)
 * Método: GET /api/assistants?tenant_id=UUID
 */
export const getAssistants = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenant_id } = req.query; // Capturamos si nos envían un ID de empresa por la URL

    let query = `SELECT * FROM assistants ORDER BY created_at DESC`;
    let params: any[] = [];

    // Si nos pasan un tenant_id, filtramos para mostrar solo los bots de esa empresa
    if (tenant_id) {
      query = `SELECT * FROM assistants WHERE tenant_id = $1 ORDER BY created_at DESC`;
      params = [tenant_id];
    }

    const result = await dbPool.query(query, params);

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error al obtener asistentes:', error);
    res.status(500).json({ error: 'Error interno del servidor al consultar asistentes' });
  }
};