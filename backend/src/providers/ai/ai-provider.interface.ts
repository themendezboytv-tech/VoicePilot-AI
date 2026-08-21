// ==============================================================================
// INTERFAZ: AI Provider
// Proyecto: VoicePilot AI
// Descripción: Contrato común que debe cumplir cualquier motor de IA
// (Gemini, OpenAI, etc.) para poder conectarse de forma intercambiable
// al resto del sistema (ai.controller.ts, telephony providers).
// ==============================================================================

export interface AIProvider {
  /**
   * Genera la respuesta del asistente a partir del prompt del sistema
   * (personalidad/instrucciones del Tenant) y el mensaje del cliente.
   */
  generateResponse(systemPrompt: string, userMessage: string): Promise<string>;
}
