// ==============================================================================
// ARCHIVO DE ENTRADA PRINCIPAL: Backend Engine
// Proyecto: VoicePilot AI
// ==============================================================================

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/database';
import { testRedisConnection } from './config/redis';

// IMPORTACIÓN DE RUTAS
import tenantRoutes from './routes/tenant.routes';
import assistantRoutes from './routes/assistant.routes'; // <-- NUEVA RUTA

dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

/**
 * Rutas de la API REST
 */
app.use('/api/tenants', tenantRoutes);
app.use('/api/assistants', assistantRoutes); // <-- NUEVO ENDPOINT ACTIVADO

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'VoicePilot AI Backend Engine',
    timestamp: new Date().toISOString(),
  });
});

async function bootstrap(): Promise<void> {
  console.log('==================================================');
  console.log('🚀 Iniciando VoicePilot AI Engine...');
  console.log('==================================================');

  await testDbConnection();
  await testRedisConnection();

  app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`📡 Servidor HTTP corriendo en: http://localhost:${PORT}`);
    console.log(`🏥 Endpoint de salud disponible en: http://localhost:${PORT}/health`);
    console.log(`🏢 API Tenants disponible en: http://localhost:${PORT}/api/tenants`);
    console.log(`🤖 API Assistants disponible en: http://localhost:${PORT}/api/assistants`);
    console.log('==================================================\n');
  });
}

bootstrap();