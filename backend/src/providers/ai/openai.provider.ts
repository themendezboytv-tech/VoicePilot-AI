// ==============================================================================
// PROVIDER DE IA: OpenAI
// Proyecto: VoicePilot AI
// ==============================================================================

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { AIProvider } from './ai-provider.interface';

dotenv.config();

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string = process.env.OPENAI_API_KEY || '', model: string = DEFAULT_MODEL) {
    if (!apiKey) {
      console.warn('⚠️ ADVERTENCIA: OPENAI_API_KEY no está configurada en .env');
    }
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateResponse(systemPrompt: string = '', userMessage: string = ''): Promise<string> {
    const safeSystem = systemPrompt || 'Eres un asistente virtual atento y profesional.';
    const safeUser = userMessage || 'Hola';

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: safeSystem },
          { role: 'user', content: safeUser }
        ]
      });

      const text = completion.choices[0]?.message?.content;

      if (!text) {
        throw new Error('OpenAI devolvió una respuesta vacía');
      }

      return text;
    } catch (error: any) {
      console.error(`❌ Fallo en el motor de IA (OpenAI, modelo ${this.model}):`, error.message || error);
      throw new Error(`Fallo en el motor de IA (OpenAI): ${error.message || error}`);
    }
  }
}
