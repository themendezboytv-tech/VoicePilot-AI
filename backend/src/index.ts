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
import callRoutes from './routes/call.routes'; // <-- IMPORTAR RUTAS DE LLAMADAS
import aiRoutes from './routes/ai.routes'; // <-- NUEVA RUTA DE IA

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
app.use('/api/calls', callRoutes); // <-- ACTIVAR ENDPOINT DE LLAMADAS
app.use('/api/ai', aiRoutes); // <-- NUEVO ENDPOINT DE INTELIGENCIA ARTIFICIAL

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
  console.log(`📞 API Call Logs disponible en: http://localhost:${PORT}/api/calls`);

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