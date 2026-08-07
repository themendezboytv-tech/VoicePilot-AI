// ==============================================================================
// RUTAS: Calls (Historial de Llamadas)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { registerCall, getCallLogs } from '../controllers/call.controller';

const router = Router();

// Obtener historial (GET /api/calls?tenant_id=...)
router.get('/', getCallLogs);

// Registrar llamada al finalizar (POST /api/calls)
router.post('/', registerCall);

export default router;