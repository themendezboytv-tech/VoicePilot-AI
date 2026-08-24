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

/**
 * Devuelve la empresa del usuario autenticado (req.user.tenant_id).
 * Antes devolvía TODAS las empresas sin ningún filtro — hueco de
 * autorización cerrado al agregar requireAuth (ver tenant.routes.ts).
 * Método: GET /api/tenants
 */
export const getTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      `SELECT id, name, slug, plan, is_active, created_at
       FROM tenants
       WHERE id = $1`,
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