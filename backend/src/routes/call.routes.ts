// ==============================================================================
// RUTAS: Calls (Historial de Llamadas)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { registerCall, getCallLogs } from '../controllers/call.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Obtener historial de la empresa autenticada (GET /api/calls)
router.get('/', requireAuth, getCallLogs);

// Registrar llamada al finalizar, para la empresa autenticada (POST /api/calls).
// Nota: el flujo real de voz/WhatsApp NO pasa por este endpoint HTTP — graba
// directo en la tabla calls vía dbPool (ver telephony.controller.ts /
// conversation.service.ts). Este endpoint queda para alta manual/futura
// integración externa, por eso también lleva requireAuth.
router.post('/', requireAuth, registerCall);

export default router;