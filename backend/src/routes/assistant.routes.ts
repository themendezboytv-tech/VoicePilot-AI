// ==============================================================================
// RUTAS: Assistants (Asistentes de IA)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { createAssistant, getAssistants } from '../controllers/assistant.controller';

const router = Router();

// Endpoint para obtener asistentes (GET /api/assistants)
router.get('/', getAssistants);

// Endpoint para registrar un nuevo asistente (POST /api/assistants)
router.post('/', createAssistant);

export default router;