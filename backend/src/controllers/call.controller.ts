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
    const { tenant_id, assistant_id, caller_number, duration_seconds, status, transcript } = req.body;

    if (!tenant_id || !assistant_id) {
      res.status(400).json({ error: 'Faltan campos obligatorios (tenant_id, assistant_id)' });
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
 * Obtiene el historial de llamadas de una empresa específica
 * Método: GET /api/calls?tenant_id=UUID
 */
export const getCallLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenant_id } = req.query;

    if (!tenant_id) {
      res.status(400).json({ error: 'Debes proporcionar un tenant_id válido en la URL' });
      return;
    }

    // Buscamos las llamadas de esa empresa, ordenadas de la más reciente a la más antigua
    const result = await dbPool.query(
      `SELECT * FROM calls WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenant_id]
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno al consultar el historial');
  }
};