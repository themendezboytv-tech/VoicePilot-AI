// ==============================================================================
// SERVICIO: Continuidad de Records
// Proyecto: VoicePilot AI
// Descripción: Busca si un contacto ya tiene un record de negocio (pedido,
// turno, reserva...) abierto y reciente, sin importar el canal que lo
// originó, para que la capa de conversación/IA pueda preguntarle al cliente
// si es una continuación en vez de asumir y crear uno nuevo.
// ==============================================================================

import { dbPool } from '../config/database';

// Ventana de "reciente" para considerar que un record sigue activo a
// efectos de continuidad. Centralizada acá para que el criterio de negocio
// quede documentado en un solo lugar.
const CONTINUITY_WINDOW_HOURS = 3;

// Statuses que se consideran "cerrados": un record en cualquier otro status
// cuenta como abierto para el chequeo de continuidad.
const CLOSED_STATUSES = ['completed', 'cancelled'];

export interface RecordRow {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  interaction_id: string | null;
  record_type: string;
  status: string;
  channel: string;
  contact_name: string | null;
  contact_identifier: string | null;
  data: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Busca el record abierto más reciente de un contacto dentro de la ventana
 * de continuidad (por defecto ~3 horas). No filtra por channel a propósito:
 * un cliente que empezó por voz y sigue por WhatsApp (o viceversa) tiene que
 * encontrar el mismo record. Usa el índice idx_records_contact_lookup
 * (tenant_id, contact_identifier, status, updated_at DESC), así que esto es
 * un solo index scan.
 * Devuelve null si no hay contactIdentifier, si no hay ningún record abierto,
 * o si el más reciente ya quedó fuera de la ventana de continuidad.
 */
export async function findOpenRecordForContact(
  tenantId: string,
  contactIdentifier: string
): Promise<RecordRow | null> {
  if (!contactIdentifier) {
    return null;
  }

  const result = await dbPool.query(
    `SELECT * FROM records
     WHERE tenant_id = $1
       AND contact_identifier = $2
       AND status <> ALL($3::varchar[])
       AND updated_at >= NOW() - ($4 * INTERVAL '1 hour')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId, contactIdentifier, CLOSED_STATUSES, CONTINUITY_WINDOW_HOURS]
  );

  return result.rows[0] || null;
}
