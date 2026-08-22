// ==============================================================================
// PROVIDER DE IA: Gemini (Auto-Fallback de Modelos)
// Proyecto: VoicePilot AI
// ==============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { AIProvider } from './ai-provider.interface';

dotenv.config();

// Lista optimizada sin modelos obsoletos (2.5) para evitar peticiones 404 innecesarias
const MODELOS_CANDIDATOS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview'
];

// Timeout duro por intento de modelo. Twilio espera el TwiML de respuesta
// con un límite de ~15s; sin este timeout, un modelo colgado podía dejar
// colgada también la cadena completa de fallback.
const MODEL_ATTEMPT_TIMEOUT_MS = 4000;

// Presupuesto total para toda la cadena de fallback (todos los modelos
// combinados), no solo por intento — así, sin importar cuántos modelos haya
// en la lista, el fallo total nunca tarda más que esto y deja margen para
// que el resto del turno (DB, Redis, armado del TwiML de hangup) termine
// bien por debajo del límite de Twilio.
const TOTAL_FALLBACK_BUDGET_MS = 7000;

// getAIProvider() crea una instancia nueva de GeminiProvider en cada turno,
// así que el caché tiene que vivir a nivel de módulo (por proceso) para
// sobrevivir entre turnos. No hay todavía API keys ni límites por tenant
// distintos, así que un caché de proceso es lo que corresponde hoy; si eso
// cambia, esto debería volverse por tenant.
let cachedWorkingModel: string | null = null;

export class GeminiProvider implements AIProvider {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string = process.env.GEMINI_API_KEY || '') {
    if (!apiKey) {
      console.warn('⚠️ ADVERTENCIA: GEMINI_API_KEY no está configurada en .env');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(systemPrompt: string = '', userMessage: string = ''): Promise<string> {
    const safeSystem = systemPrompt || 'Eres un asistente virtual atento y profesional.';
    const safeUser = userMessage || 'Hola';
    const promptCompleto = `[Instrucciones del Sistema]:\n${safeSystem}\n\n[Mensaje del Cliente]:\n${safeUser}`;

    // Si un modelo respondió con éxito la última vez, probarlo primero para
    // no perder tiempo re-intentando en cada turno los que ya sabemos que
    // están caídos o no habilitados para esta API key.
    const ordenDeIntento = cachedWorkingModel
      ? [cachedWorkingModel, ...MODELOS_CANDIDATOS.filter((m) => m !== cachedWorkingModel)]
      : MODELOS_CANDIDATOS;

    const deadline = Date.now() + TOTAL_FALLBACK_BUDGET_MS;
    let ultimoError: any = null;

    for (const modelName of ordenDeIntento) {
      const tiempoRestante = deadline - Date.now();
      if (tiempoRestante <= 0) {
        console.warn('⚠️ Presupuesto de tiempo para el fallback de Gemini agotado, se corta la cadena sin probar más modelos.');
        break;
      }

      const timeoutDeEsteIntento = Math.min(MODEL_ATTEMPT_TIMEOUT_MS, tiempoRestante);

      try {
        console.log(`🤖 Probando generación con modelo: ${modelName}... (timeout ${timeoutDeEsteIntento}ms)`);
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(promptCompleto, { timeout: timeoutDeEsteIntento });
        const response = await result.response;
        const text = response.text();

        if (text) {
          console.log(`✅ ¡Éxito! Modelo funcional confirmado: ${modelName}`);
          cachedWorkingModel = modelName;
          return text;
        }
      } catch (error: any) {
        console.warn(`⚠️ Modelo ${modelName} no aceptó la petición: ${error.message || error}`);
        ultimoError = error;
        if (cachedWorkingModel === modelName) {
          // El modelo cacheado dejó de responder: se limpia el caché para
          // que el próximo turno vuelva a evaluar la lista completa en vez
          // de insistir en un modelo que ya sabemos que está caído ahora.
          cachedWorkingModel = null;
        }
      }
    }

    console.error('❌ Todos los modelos candidatos fallaron (o se agotó el presupuesto de tiempo del fallback). Último error:', ultimoError);
    throw new Error(`Fallo en el motor de IA (Gemini): ${ultimoError?.message || ultimoError || 'se agotó el presupuesto de tiempo del fallback'}`);
  }
}
