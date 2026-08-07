// ==============================================================================
// ARCHIVO DE ENTRADA PRINCIPAL: Backend Engine
// Proyecto: VoicePilot AI
// Descripción: Servidor Express con verificación de bases de datos en tiempo real.
// ==============================================================================

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/database';
import { testRedisConnection } from './config/redis';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// Inicialización de la aplicación Express
const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

// Middlewares globales
app.use(cors()); // Habilita peticiones cruzadas desde el frontend
app.use(express.json()); // Permite al servidor procesar JSON en las peticiones

/**
 * Ruta de Salud (Health Check)
 * Útil para monitorear el estado del servidor
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'VoicePilot AI Backend Engine',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Función de arranque del servidor y verificación de servicios
 */
async function bootstrap(): Promise<void> {
  console.log('==================================================');
  console.log('🚀 Iniciando VoicePilot AI Engine...');
  console.log('==================================================');

  // Probar conexiones a la infraestructura Docker
  await testDbConnection();
  await testRedisConnection();

  // Iniciar la escucha de peticiones HTTP
  app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`📡 Servidor HTTP corriendo en: http://localhost:${PORT}`);
    console.log(`🏥 Endpoint de salud disponible en: http://localhost:${PORT}/health`);
    console.log('==================================================\n');
  });
}

// Ejecutar proceso de inicio
bootstrap();