// ==============================================================================
// RUTAS: AI Integration
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { handleAIBotInteraction } from '../controllers/ai.controller';

const router = Router();

// Endpoint para interactuar con el cerebro del bot (POST /api/ai/chat)
router.post('/chat', handleAIBotInteraction);

export default router;