// ==============================================================================
// SERVICIO: Rate limiting
// Proyecto: VoicePilot AI
// Descripción: Contador de intentos con ventana fija sobre Redis (INCR +
// EXPIRE), sin dependencias nuevas — reusa el redisClient que ya existe
// para la memoria de conversación. Usado hoy por auth.controller.ts (login
// y registro); genérico para que cualquier otro endpoint lo pueda reusar.
// ==============================================================================

import { redisClient } from '../config/redis';

export interface RateLimitStatus {
  blocked: boolean;
  // Segundos hasta que la ventana actual expire (0 si la key no existe).
  retryAfterSeconds: number;
}

/**
 * Chequea el estado de una key SIN incrementarla — se usa antes de hacer
 * cualquier trabajo real (consulta a la DB, hash de contraseña, etc.) para
 * poder responder 429 rápido sin gastar esos recursos.
 */
export async function checkRateLimit(key: string, limit: number): Promise<RateLimitStatus> {
  const [countRaw, ttl] = await Promise.all([redisClient.get(key), redisClient.ttl(key)]);
  const count = countRaw ? parseInt(countRaw, 10) : 0;

  return {
    blocked: count >= limit,
    retryAfterSeconds: ttl > 0 ? ttl : 0,
  };
}

/**
 * Incrementa el contador de una key. Ventana fija: la expiración se setea
 * una sola vez, la primera vez que la key se crea (count === 1) — no se
 * renueva en cada incremento, así la ventana siempre "cierra" a tiempo fijo
 * desde el primer intento, en vez de poder extenderse indefinidamente.
 */
export async function registerAttempt(key: string, windowSeconds: number): Promise<void> {
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, windowSeconds);
  }
}

/**
 * Borra una o más keys — se usa para limpiar los contadores ante un intento
 * exitoso (login correcto), así un cliente real nunca se acerca al límite
 * por el solo hecho de usar la app normalmente.
 */
export async function clearRateLimit(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await redisClient.del(...keys);
}
