// ==============================================================================
// RUTAS: Assistants (Asistentes de IA)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { createAssistant, getAssistants } from '../controllers/assistant.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Endpoint para obtener los asistentes de la empresa autenticada (GET /api/assistants)
router.get('/', requireAuth, getAssistants);

// Endpoint para registrar un nuevo asistente para la empresa autenticada (POST /api/assistants)
router.post('/', requireAuth, createAssistant);

export default router;