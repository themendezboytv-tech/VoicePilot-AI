// ==============================================================================
// CONTROLADOR: Tenants (Empresas)
// Proyecto: VoicePilot AI
// Descripción: Gestiona la lógica de negocio para la creación y consulta de empresas.
// ==============================================================================

import { Request, Response } from 'express';
import { dbPool } from '../config/database';

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
    console.error('❌ Error al crear tenant:', error);
    
    // Capturar error de duplicidad de 'slug' (código 23505 en PostgreSQL)
    if (error.code === '23505') {
      res.status(409).json({ error: 'El slug (identificador) ya está en uso por otra empresa' });
      return;
    }
    
    res.status(500).json({ error: 'Error interno del servidor al crear la empresa' });
  }
};

/**
 * Obtiene la lista de todas las empresas registradas
 * Método: GET /api/tenants
 */
export const getTenants = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      `SELECT id, name, slug, plan, is_active, created_at 
       FROM tenants 
       ORDER BY created_at DESC`
    );

    res.status(200).json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error al obtener tenants:', error);
    res.status(500).json({ error: 'Error interno del servidor al consultar empresas' });
  }
};