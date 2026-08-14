// ==============================================================================
// SERVICIO: Gemini AI Engine (Auto-Fallback de Modelos)
// Proyecto: VoicePilot AI
// ==============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('⚠️ ADVERTENCIA: GEMINI_API_KEY no está configurada en .env');
}

const genAI = new GoogleGenerativeAI(apiKey);

// Lista optimizada sin modelos obsoletos (2.5) para evitar peticiones 404 innecesarias
const MODELOS_CANDIDATOS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview'
];
export const generateAssistantResponse = async (
  systemPrompt: string = '',
  userMessage: string = ''
): Promise<string> => {
  const safeSystem = systemPrompt || 'Eres un asistente virtual atento y profesional.';
  const safeUser = userMessage || 'Hola';
  const promptCompleto = `[Instrucciones del Sistema]:\n${safeSystem}\n\n[Mensaje del Cliente]:\n${safeUser}`;

  let ultimoError: any = null;

  for (const modelName of MODELOS_CANDIDATOS) {
    try {
      console.log(`🤖 Probando generación con modelo: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptCompleto);
      const response = await result.response;
      const text = response.text();

      if (text) {
        console.log(`✅ ¡Éxito! Modelo funcional confirmado: ${modelName}`);
        return text;
      }
    } catch (error: any) {
      console.warn(`⚠️ Modelo ${modelName} no aceptó la petición: ${error.message || error}`);
      ultimoError = error;
    }
  }

  console.error('❌ Todos los modelos candidatos fallaron. Último error:', ultimoError);
  throw new Error(`Fallo en el motor de IA: ${ultimoError?.message || ultimoError}`);
};