// ==============================================================================
// MÓDULO DE CONEXIÓN: Redis Client
// Proyecto: VoicePilot AI
// Descripción: Cliente de memoria en tiempo real para sesiones y contexto de llamadas.
// ==============================================================================

import Redis from 'ioredis';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

/**
 * Instancia del cliente Redis
 */
export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  lazyConnect: true, // Conecta de forma explícita al invocar .connect()
});

/**
 * Función para probar la conexión activa con Redis
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redisClient.connect();
    console.log('✅ [Redis] Conexión establecida exitosamente con el contenedor alpha_cache.');
    return true;
  } catch (error) {
    console.error('❌ [Redis] Error al conectar con el servidor de caché:', error);
    return false;
  }
}