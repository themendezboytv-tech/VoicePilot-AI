// ==============================================================================
// UTILIDAD: Clasificación de errores de PostgreSQL
// Proyecto: VoicePilot AI
// Descripción: Traduce errores crudos de `pg` a respuestas HTTP con sentido,
// para no devolver el mismo 500 genérico tanto si falta un registro como
// si la base de datos está caída.
// ==============================================================================

import { Response } from 'express';

// Errores de red/infraestructura: la base de datos no está disponible,
// no es un problema con los datos que mandó el cliente.
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P03', // cannot_connect_now (Postgres se está reiniciando)
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004'  // sqlserver_rejected_establishment_of_sqlconnection
]);

/**
 * Inspecciona un error atrapado en un catch de controller y responde con el
 * código HTTP y mensaje que mejor describen la causa real, en vez de un 500
 * genérico. Loguea siempre el error completo para debugging.
 */
export function respondToDbError(error: any, res: Response, fallbackMessage: string): void {
  console.error(`❌ ${fallbackMessage} [code=${error?.code ?? 'desconocido'}]:`, error);

  if (CONNECTION_ERROR_CODES.has(error?.code)) {
    res.status(503).json({
      error: 'No se pudo conectar con la base de datos. Intenta de nuevo en unos segundos.'
    });
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({ error: 'El registro ya existe (violación de restricción única).' });
    return;
  }

  if (error?.code === '23503') {
    res.status(400).json({
      error: 'Referencia inválida: el recurso relacionado (ej. tenant_id o assistant_id) no existe.'
    });
    return;
  }

  if (error?.code === '23502') {
    res.status(400).json({ error: 'Falta un campo obligatorio para completar la operación.' });
    return;
  }

  res.status(500).json({ error: fallbackMessage });
}
