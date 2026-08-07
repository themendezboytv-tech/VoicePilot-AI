// ==============================================================================
// SERVICIO: Gemini AI Engine (Con SDK Clásico Estable)
// Proyecto: VoicePilot AI
// ==============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('⚠️ ADVERTENCIA: GEMINI_API_KEY no está configurada en las variables de entorno.');
}

// Inicializar con la librería clásica y estable
const genAI = new GoogleGenerativeAI(apiKey);

export const generateAssistantResponse = async (
  systemPrompt: string,
  userMessage: string
): Promise<string> => {
  try {
    // Usamos el modelo estándar gemini-1.5-flash con systemInstruction nativo
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemPrompt
    });

    const result = await model.generateContent(userMessage);
    const response = await result.response;
    
    return response.text() || 'Lo siento, no he podido procesar una respuesta en este momento.';
  } catch (error: any) {
    console.error('❌ Error al conectar con la API de Gemini:', error);
    throw new Error(`Fallo crítico en el motor de Inteligencia Artificial: ${error.message || error}`);
  }
};