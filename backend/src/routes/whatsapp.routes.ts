// ==============================================================================
// RUTAS: WhatsApp (INTEGRACIÓN PROVISORIA — ver whatsapp.controller.ts)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { handleWhatsappInbound } from '../controllers/whatsapp.controller';

const router = Router();

// Webhook que llama whatsapp-unificado por cada mensaje entrante
// (POST /api/whatsapp/webhook)
router.post('/webhook', handleWhatsappInbound);

export default router;
