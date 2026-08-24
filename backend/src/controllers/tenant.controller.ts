// ==============================================================================
// CONTROLADOR: Tenants (Empresas)
// Proyecto: VoicePilot AI
// Descripción: Gestiona la lógica de negocio para la creación y consulta de empresas.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';

/**
 * Crea una nueva empresa (Tenant) en la base de datos
 * Método: POST /api/tenants
 */
export const createTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, plan } = req.body;

    // Validación básica de los datos de entrada
    if (!name || !slug) {
      res.status(400).json({ error: 'El nombre y el slug son obligatorios' });
      return;
    }

    // Insertar en PostgreSQL y devolver el registro creado (RETURNING *)
    const result = await dbPool.query(
      `INSERT INTO tenants (name, slug, plan) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, slug, plan, is_active, created_at`,
      [name, slug, plan || 'basic']
    );

    // Responder con éxito y los datos de la empresa recién creada
    res.status(201).json({
      message: 'Empresa creada exitosamente',
      data: result.rows[0]
    });
  } catch (error: any) {
    // El slug duplicado es el caso más común y merece un mensaje específico;
    // el resto (conexión caída, FK inválida, etc.) lo cubre el helper.
    if (error.code === '23505') {
      console.error('❌ Error al crear tenant (slug duplicado):', error);
      res.status(409).json({ error: 'El slug (identificador) ya está en uso por otra empresa' });
      return;
    }

    respondToDbError(error, res, 'Error interno del servidor al crear la empresa');
  }
};

const TENANT_COLUMNS = `id, name, slug, plan, is_active, business_type, account_status, delivery_whatsapp_number, created_at`;

/**
 * Devuelve la empresa del usuario autenticado (req.user.tenant_id).
 * Antes devolvía TODAS las empresas sin ningún filtro — hueco de
 * autorización cerrado al agregar requireAuth (ver tenant.routes.ts).
 * Método: GET /api/tenants
 */
export const getTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      `SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = $1`,
      [req.user!.tenant_id]
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar empresas');
  }
};

/**
 * Obtiene el detalle de una empresa puntual por :id, solo si es la del
 * usuario autenticado. Se responde 404 (no 403) ante un id de otro tenant,
 * para no revelar que ese id existe (mismo criterio que records).
 * Método: GET /api/tenants/:id
 */
export const getTenantById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id !== req.user!.tenant_id) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const result = await dbPool.query(`SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar la empresa');
  }
};

// Campos editables desde el panel de cliente. A propósito NO incluye slug,
// plan, is_active ni account_status — son datos de administración/negocio
// que hoy no se autoservéan (is_active/account_status van a depender de
// "VoicePilot Admin" a futuro, ver CLAUDE.md).
const TENANT_EDITABLE_FIELDS = ['name', 'business_type', 'delivery_whatsapp_number'] as const;

/**
 * Actualiza datos editables de la propia empresa (Ajustes de cuenta /
 * Configuración del asistente en el panel). Solo permite tocar la empresa
 * del usuario autenticado.
 * Método: PATCH /api/tenants/:id
 * Body: cualquier subconjunto de TENANT_EDITABLE_FIELDS
 */
export const updateTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id !== req.user!.tenant_id) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of TENANT_EDITABLE_FIELDS) {
      if (field in req.body) {
        params.push(req.body[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: `No enviaste ningún campo editable. Válidos: ${TENANT_EDITABLE_FIELDS.join(', ')}` });
      return;
    }

    params.push(id);
    const result = await dbPool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${TENANT_COLUMNS}`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    res.status(200).json({
      message: 'Empresa actualizada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al actualizar la empresa');
  }
};