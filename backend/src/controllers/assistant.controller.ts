// ==============================================================================
// CONTROLADOR: Assistants (Asistentes de IA)
// Proyecto: VoicePilot AI
// Descripción: Gestiona la lógica para crear y consultar los bots de voz.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';

/**
 * Crea un nuevo Asistente Telefónico
 * Método: POST /api/assistants
 */
export const createAssistant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, system_prompt, greeting_message, voice_id, phone_number, ai_provider, telephony_provider } = req.body;
    // tenant_id sale del token, no del body: si no, cualquier usuario
    // autenticado podría crear un asistente para otro tenant con solo
    // cambiar el campo en la request.
    const tenant_id = req.user!.tenant_id;

    // Validación básica: Necesitamos saber a qué empresa pertenece y sus instrucciones
    if (!name || !system_prompt || !greeting_message) {
      res.status(400).json({
        error: 'Faltan campos obligatorios (name, system_prompt, greeting_message)'
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
    respondToDbError(error, res, 'Error interno del servidor al crear el asistente');
  }
};

/**
 * Obtiene la lista de asistentes de la empresa autenticada. Antes aceptaba
 * ?tenant_id= de cualquiera y, sin ese parámetro, devolvía los asistentes de
 * TODAS las empresas — hueco de autorización cerrado al agregar requireAuth
 * y forzar el filtro por req.user.tenant_id (ver assistant.routes.ts).
 * Método: GET /api/assistants
 */
export const getAssistants = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      `SELECT * FROM assistants WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user!.tenant_id]
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar asistentes');
  }
};

/**
 * Obtiene un asistente puntual, solo si pertenece a la empresa autenticada.
 * 404 (no 403) ante un id de otro tenant, para no revelar su existencia.
 * Método: GET /api/assistants/:id
 */
export const getAssistantById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await dbPool.query(
      `SELECT * FROM assistants WHERE id = $1 AND tenant_id = $2`,
      [id, req.user!.tenant_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Asistente no encontrado' });
      return;
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar el asistente');
  }
};

// Campos editables desde "Configuración del asistente" en el panel.
// pricing_info/business_hours van como JSONB completo (se reemplazan
// enteros, no merge parcial — igual de simple que records.data hasta que
// haga falta algo más fino).
const ASSISTANT_EDITABLE_FIELDS = [
  'name',
  'system_prompt',
  'greeting_message',
  'voice_id',
  'phone_number',
  'ai_provider',
  'telephony_provider',
  'captures_records',
  'default_record_type',
  'pricing_info',
  'business_hours'
] as const;

/**
 * Actualiza un asistente, solo si pertenece a la empresa autenticada.
 * Método: PATCH /api/assistants/:id
 * Body: cualquier subconjunto de ASSISTANT_EDITABLE_FIELDS
 */
export const updateAssistant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of ASSISTANT_EDITABLE_FIELDS) {
      if (field in req.body) {
        const value = req.body[field];
        params.push(
          (field === 'pricing_info' || field === 'business_hours') && value !== null
            ? JSON.stringify(value)
            : value
        );
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: `No enviaste ningún campo editable. Válidos: ${ASSISTANT_EDITABLE_FIELDS.join(', ')}` });
      return;
    }

    params.push(id, req.user!.tenant_id);
    const result = await dbPool.query(
      `UPDATE assistants SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Asistente no encontrado' });
      return;
    }

    res.status(200).json({
      message: 'Asistente actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al actualizar el asistente');
  }
};