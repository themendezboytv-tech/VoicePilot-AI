// ==============================================================================
// FACTORY: AI Providers
// Proyecto: VoicePilot AI
// Descripción: Punto único para resolver qué motor de IA usar según el
// campo `ai_provider` configurado por Assistant/Tenant.
// ==============================================================================

import { AIProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';

export type { AIProvider } from './ai-provider.interface';

const providers: Record<string, () => AIProvider> = {
  gemini: () => new GeminiProvider(),
  openai: () => new OpenAIProvider()
};

/**
 * Devuelve la instancia del provider de IA correspondiente.
 * Si el nombre no coincide con ninguno conocido, cae a Gemini por defecto.
 */
export function getAIProvider(providerName: string = 'gemini'): AIProvider {
  const factory = providers[providerName?.toLowerCase()];

  if (!factory) {
    console.warn(`⚠️ ai_provider "${providerName}" desconocido, usando Gemini por defecto.`);
    return providers.gemini();
  }

  return factory();
}
