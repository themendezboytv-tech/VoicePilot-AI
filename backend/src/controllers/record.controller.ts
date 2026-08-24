// ==============================================================================
// CONTROLADOR: Records (Pedidos, turnos, reservas...)
// Proyecto: VoicePilot AI
// Descripción: CRUD básico del modelo genérico de "resultado de negocio".
// Una sola tabla física para todos los tipos de negocio (record_type +
// data JSONB), reutilizada sin importar el canal de origen (voz hoy,
// WhatsApp a futuro).
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';
import { findOpenRecordForContact, createRecord as createRecordInDb } from '../services/record.service';

// Statuses válidos del ciclo de vida de un record. Se valida acá (a nivel
// aplicación) en vez de con un CHECK en la base de datos, siguiendo la
// misma convención que el resto del schema (status como VARCHAR libre).
const VALID_STATUSES = ['received', 'in_progress', 'ready', 'completed', 'cancelled'];

/**
 * Crea un nuevo Record, salvo que el contacto ya tenga uno abierto y
 * reciente (ver findOpenRecordForContact) — en ese caso, en vez de crear
 * uno nuevo automáticamente, devuelve el existente para que la capa de
 * conversación/IA le pregunte al cliente si es el mismo o uno nuevo.
 * Si el cliente ya confirmó que es un pedido distinto, el llamador puede
 * mandar force_new=true para saltear el chequeo y crear igual.
 * Método: POST /api/records
 */
export const createRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      assistant_id,
      interaction_id,
      record_type,
      channel,
      contact_name,
      contact_identifier,
      data,
      notes,
      force_new
    } = req.body;
    // tenant_id sale del token, no del body (ver mismo criterio en
    // assistant.controller.ts): evita que un usuario cree records para
    // otro tenant con solo cambiar el campo en la request.
    const tenant_id = req.user!.tenant_id;

    // Validación básica: sin saber qué tipo de record es, no hay nada que guardar.
    if (!record_type) {
      res.status(400).json({ error: 'El campo record_type es obligatorio' });
      return;
    }

    // Chequeo de continuidad entre canales: si el contacto tiene un record
    // abierto reciente, no se crea uno nuevo sin preguntar primero.
    if (contact_identifier && !force_new) {
      const openRecord = await findOpenRecordForContact(tenant_id, contact_identifier);

      if (openRecord) {
        res.status(200).json({
          created: false,
          open_record_found: true,
          message: 'Este contacto ya tiene un registro abierto reciente. Confirmá con el cliente si es una continuación de ese registro o uno nuevo (y volvé a llamar a este endpoint con force_new=true si es nuevo).',
          data: openRecord
        });
        return;
      }
    }

    // Misma función que usa el flujo de voz (telephony.controller.ts) para
    // crear records, así el SQL de inserción vive en un solo lugar.
    const record = await createRecordInDb({
      tenantId: tenant_id,
      assistantId: assistant_id,
      interactionId: interaction_id,
      recordType: record_type,
      channel,
      contactName: contact_name,
      contactIdentifier: contact_identifier,
      data,
      notes
    });

    res.status(201).json({
      created: true,
      message: 'Record creado exitosamente',
      data: record
    });
  } catch (error: any) {
    respondToDbError(error, res, 'Error interno del servidor al crear el record');
  }
};

/**
 * Lista los records de la empresa autenticada, con filtros opcionales por
 * status, channel y record_type. Antes aceptaba cualquier ?tenant_id= de la
 * URL sin verificar que fuera del que hace la request — hueco de
 * autorización cerrado al forzar el filtro por req.user.tenant_id.
 * Método: GET /api/records?status=...&channel=...&record_type=...
 */
export const getRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, channel, record_type } = req.query;

    // Arma el WHERE dinámicamente según los filtros opcionales presentes,
    // manteniendo todo parametrizado.
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [req.user!.tenant_id];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (channel) {
      params.push(channel);
      conditions.push(`channel = $${params.length}`);
    }

    if (record_type) {
      params.push(record_type);
      conditions.push(`record_type = $${params.length}`);
    }

    const result = await dbPool.query(
      `SELECT * FROM records WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar records');
  }
};

/**
 * Obtiene un Record puntual por su id, solo si pertenece a la empresa
 * autenticada. Antes devolvía cualquier record por id sin chequear tenant —
 * cualquier usuario logueado podía leer pedidos de otro negocio adivinando
 * (o iterando) UUIDs. Se responde 404 en vez de 403 ante un tenant distinto
 * para no revelar que el id existe.
 * Método: GET /api/records/:id
 */
export const getRecordById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await dbPool.query(
      'SELECT * FROM records WHERE id = $1 AND tenant_id = $2',
      [id, req.user!.tenant_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Record no encontrado' });
      return;
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar el record');
  }
};

/**
 * Actualiza el status de un Record (ej. received -> in_progress -> ready ->
 * completed, o cancelled en cualquier punto del ciclo), solo si pertenece a
 * la empresa autenticada (mismo criterio que getRecordById).
 * Método: PATCH /api/records/:id/status
 */
export const updateRecordStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'El campo status es obligatorio' });
      return;
    }

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({
        error: `Status inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}`
      });
      return;
    }

    const result = await dbPool.query(
      `UPDATE records SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, req.user!.tenant_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Record no encontrado' });
      return;
    }

    res.status(200).json({
      message: 'Status actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al actualizar el record');
  }
};
