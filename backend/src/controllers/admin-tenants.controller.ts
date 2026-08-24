// ==============================================================================
// CONTROLADOR: Tenants desde VoicePilot Admin
// Proyecto: VoicePilot AI
// Descripción: Listado/detalle de todos los tenants (sin scope — a
// diferencia de tenant.controller.ts del panel de cliente, acá SÍ se ve
// todo, es la vista de superadmin) y edición de account_status, plan y
// demo_expires_at. Requiere requireSuperAdmin en las rutas (ver
// admin-tenants.routes.ts) — nunca requireAuth de cliente.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';
import { respondToDbError } from '../utils/db-errors';

// Mismo criterio que VALID_STATUSES en record.controller.ts: estado como
// VARCHAR libre, validado a nivel aplicación, sin CHECK en la base.
const VALID_ACCOUNT_STATUSES = ['demo', 'active', 'suspended'];

const TENANT_LIST_COLUMNS = `
  t.id, t.name, t.slug, t.plan, t.is_active, t.business_type,
  t.account_status, t.demo_expires_at, t.delivery_whatsapp_number, t.created_at
`;

/**
 * Lista TODOS los tenants (sin filtrar por ninguna sesión de cliente, esto
 * es la vista de plataforma completa), con actividad básica agregada
 * (cuántos records y cuántas calls tiene cada uno) para que el superadmin
 * pueda priorizar a quién mirar.
 * Método: GET /api/admin/tenants
 */
export const listTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      `SELECT ${TENANT_LIST_COLUMNS},
              COALESCE(r.records_count, 0) AS records_count,
              COALESCE(c.calls_count, 0) AS calls_count
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS records_count FROM records GROUP BY tenant_id
       ) r ON r.tenant_id = t.id
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS calls_count FROM calls GROUP BY tenant_id
       ) c ON c.tenant_id = t.id
       ORDER BY t.created_at DESC`
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar tenants');
  }
};

/**
 * Detalle de un tenant puntual, con la misma actividad agregada que el
 * listado más los usuarios del panel de cliente asociados (email, rol) —
 * sin exponer password_hash.
 * Método: GET /api/admin/tenants/:id
 */
export const getTenantDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const tenantResult = await dbPool.query(
      `SELECT ${TENANT_LIST_COLUMNS},
              (SELECT COUNT(*) FROM records WHERE tenant_id = t.id) AS records_count,
              (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id) AS calls_count
       FROM tenants t
       WHERE t.id = $1`,
      [id]
    );

    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Tenant no encontrado' });
      return;
    }

    const usersResult = await dbPool.query(
      `SELECT id, email, role, is_active, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const assistantsResult = await dbPool.query(
      `SELECT id, name, phone_number, ai_provider, telephony_provider, created_at FROM assistants WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.status(200).json({
      data: {
        ...tenantResult.rows[0],
        users: usersResult.rows,
        assistants: assistantsResult.rows
      }
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al consultar el tenant');
  }
};

// Campos editables desde VoicePilot Admin. plan es texto libre a propósito
// (no hay estructura de planes decidida todavía, ver docs/design-voicepilot-admin.md).
const ADMIN_EDITABLE_FIELDS = ['account_status', 'demo_expires_at', 'plan'] as const;

/**
 * Actualiza account_status, demo_expires_at y/o plan de un tenant. Cubre
 * "aprobar" (account_status -> 'active'), "suspender"/"reactivar"
 * (account_status -> 'suspended'/'active') y "marcar demo con vencimiento"
 * (account_status -> 'demo' + demo_expires_at) con un solo endpoint, en vez
 * de uno separado por acción — son todos el mismo tipo de cambio.
 * Método: PATCH /api/admin/tenants/:id
 * Body: cualquier subconjunto de ADMIN_EDITABLE_FIELDS
 */
export const updateTenantAsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if ('account_status' in req.body && !VALID_ACCOUNT_STATUSES.includes(req.body.account_status)) {
      res.status(400).json({
        error: `account_status inválido. Valores permitidos: ${VALID_ACCOUNT_STATUSES.join(', ')}`
      });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of ADMIN_EDITABLE_FIELDS) {
      if (field in req.body) {
        params.push(req.body[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: `No enviaste ningún campo editable. Válidos: ${ADMIN_EDITABLE_FIELDS.join(', ')}` });
      return;
    }

    params.push(id);
    const result = await dbPool.query(
      `UPDATE tenants AS t SET ${setClauses.join(', ')} WHERE t.id = $${params.length} RETURNING ${TENANT_LIST_COLUMNS}`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Tenant no encontrado' });
      return;
    }

    res.status(200).json({
      message: 'Tenant actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    respondToDbError(error, res, 'Error interno del servidor al actualizar el tenant');
  }
};
