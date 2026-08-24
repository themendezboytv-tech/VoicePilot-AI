// ==============================================================================
// CONTROLADOR: Calls (Historial de Llamadas)
// Proyecto: VoicePilot AI
// Descripción: Gestiona el registro de llamadas y transcripciones de la IA.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';

/**
 * Registra una nueva llamada en el historial (Normalmente llamado por un Webhook al terminar)
 * Método: POST /api/calls
 */
export const registerCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const { assistant_id, caller_number, duration_seconds, status, transcript } = req.body;
    const tenant_id = req.user!.tenant_id;

    if (!assistant_id) {
      res.status(400).json({ error: 'Falta el campo obligatorio assistant_id' });
      return;
    }

    const result = await dbPool.query(
      `INSERT INTO calls (tenant_id, assistant_id, caller_number, duration_seconds, status, transcript) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        tenant_id, 
        assistant_id, 
        caller_number || 'Oculto', 
        duration_seconds || 0, 
        status || 'completed', 
        transcript || ''
      ]
    );

    res.status(201).json({
      message: 'Llamada registrada con éxito',
      data: result.rows[0]
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al registrar la llamada');
  }
};

/**
 * Obtiene el historial de llamadas de la empresa autenticada. Antes
 * aceptaba cualquier ?tenant_id= de la URL sin verificarlo — hueco de
 * autorización cerrado al forzar el filtro por req.user.tenant_id.
 * Método: GET /api/calls
 */
export const getCallLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    // Buscamos las llamadas de esa empresa, ordenadas de la más reciente a la más antigua
    const result = await dbPool.query(
      `SELECT * FROM calls WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user!.tenant_id]
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno al consultar el historial');
  }
};