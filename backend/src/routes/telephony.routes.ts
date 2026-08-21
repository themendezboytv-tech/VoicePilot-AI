// ==============================================================================
// RUTAS: Telephony Webhooks
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { handleIncomingCall, handleSpeechResult } from '../controllers/telephony.controller';

const router = Router();

// Webhook de llamada entrante (configurar en el número de Twilio)
router.post('/twilio/voice', handleIncomingCall);

// Webhook del resultado de voz-a-texto de cada turno de la conversación
router.post('/twilio/gather', handleSpeechResult);

export default router;
