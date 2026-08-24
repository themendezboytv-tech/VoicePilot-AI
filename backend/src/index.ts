// ==============================================================================
// ARCHIVO DE ENTRADA PRINCIPAL: Backend Engine
// Proyecto: VoicePilot AI
// ==============================================================================

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/database';
import { testRedisConnection } from './config/redis';
import { runMigrations } from './database/migrator'; // <-- 1. IMPORTACIÓN DEL MIGRADOR

// IMPORTACIÓN DE RUTAS
import tenantRoutes from './routes/tenant.routes';
import assistantRoutes from './routes/assistant.routes';
import callRoutes from './routes/call.routes';
import recordRoutes from './routes/record.routes';
import aiRoutes from './routes/ai.routes';
import telephonyRoutes from './routes/telephony.routes';
import authRoutes from './routes/auth.routes';

dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

// En producción corre detrás de un proxy TLS; sin esto req.protocol
// siempre da 'http' y la validación de X-Twilio-Signature (que firma la
// URL completa, incluyendo el esquema) fallaría siempre.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());
// Twilio (y la mayoría de proveedores de telefonía) envían sus webhooks
// como application/x-www-form-urlencoded, no JSON.
app.use(express.urlencoded({ extended: false }));

/**
 * Rutas de la API REST
 */
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/assistants', assistantRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/telephony', telephonyRoutes);

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

  // 1. Probar conexiones
  await testDbConnection();
  await testRedisConnection();

  // 2. Ejecutar migraciones automáticas
  await runMigrations(); // <-- 2. EJECUCIÓN ANTES DE ABRIR EL PUERTO

  // 3. Levantar el servidor
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