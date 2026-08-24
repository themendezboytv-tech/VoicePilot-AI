// ==============================================================================
// RUTAS: Assistants (Asistentes de IA)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { createAssistant, getAssistants, getAssistantById, updateAssistant } from '../controllers/assistant.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Endpoint para obtener los asistentes de la empresa autenticada (GET /api/assistants)
router.get('/', requireAuth, getAssistants);

// Endpoint para registrar un nuevo asistente para la empresa autenticada (POST /api/assistants)
router.post('/', requireAuth, createAssistant);

// Detalle y edición de un asistente puntual (Configuración del asistente)
router.get('/:id', requireAuth, getAssistantById);
router.patch('/:id', requireAuth, updateAssistant);

export default router;