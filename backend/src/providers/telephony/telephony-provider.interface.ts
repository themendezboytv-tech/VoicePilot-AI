// ==============================================================================
// INTERFAZ: Telephony Provider
// Proyecto: VoicePilot AI
// Descripción: Contrato común que debe cumplir cualquier proveedor de
// telefonía (Twilio, Vonage, Plivo, SIP propio...) para conectar una
// llamada real con el motor de IA sin acoplar el resto del sistema al
// formato de payload/markup específico del proveedor.
// ==============================================================================

/** Datos normalizados de una llamada entrante, sin importar el proveedor. */
export interface IncomingCallPayload {
  from: string;
  to: string;
  callSid: string;
}

/** Datos normalizados del resultado de voz-a-texto de un turno de conversación. */
export interface SpeechResultPayload {
  from: string;
  to: string;
  callSid: string;
  speechResult: string;
}

/** Respuesta de voz lista para devolver al proveedor (markup + content-type). */
export interface VoiceResponse {
  body: string;
  contentType: string;
}

export interface TelephonyProvider {
  /** Normaliza el payload crudo del webhook de llamada entrante. */
  parseIncomingCall(rawBody: any): IncomingCallPayload;

  /** Normaliza el payload crudo del webhook de resultado de speech-to-text. */
  parseSpeechResult(rawBody: any): SpeechResultPayload;

  /** Construye la respuesta que saluda al cliente y espera su voz. */
  buildGreetingResponse(greetingMessage: string, gatherActionUrl: string): VoiceResponse;

  /** Construye la respuesta que dice la respuesta de la IA y vuelve a escuchar. */
  buildReplyResponse(aiReplyText: string, gatherActionUrl: string): VoiceResponse;

  /** Construye la respuesta final que despide y cuelga la llamada. */
  buildHangupResponse(finalMessage: string): VoiceResponse;
}
