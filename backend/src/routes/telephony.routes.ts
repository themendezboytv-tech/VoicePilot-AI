// ==============================================================================
// RUTAS: Telephony Webhooks
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { handleIncomingCall, handleSpeechResult, handleCallStatus } from '../controllers/telephony.controller';

const router = Router();

// Webhook de llamada entrante (configurar en el número de Twilio)
router.post('/twilio/voice', handleIncomingCall);

// Webhook del resultado de voz-a-texto de cada turno de la conversación
router.post('/twilio/gather', handleSpeechResult);

// Webhook de cambios de estado de la llamada (configurar como StatusCallback
// en el número de Twilio, separado del VoiceUrl)
router.post('/twilio/status', handleCallStatus);

export default router;
