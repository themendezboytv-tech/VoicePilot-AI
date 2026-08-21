// ==============================================================================
// FACTORY: Telephony Providers
// Proyecto: VoicePilot AI
// Descripción: Punto único para resolver qué proveedor de telefonía usar
// según el campo `telephony_provider` configurado por Assistant/Tenant.
// ==============================================================================

import { TelephonyProvider } from './telephony-provider.interface';
import { TwilioProvider } from './twilio.provider';

export type { TelephonyProvider, IncomingCallPayload, SpeechResultPayload, VoiceResponse } from './telephony-provider.interface';

const providers: Record<string, () => TelephonyProvider> = {
  twilio: () => new TwilioProvider()
};

/**
 * Devuelve la instancia del provider de telefonía correspondiente.
 * Si el nombre no coincide con ninguno conocido, cae a Twilio por defecto
 * (único proveedor real implementado hasta ahora).
 */
export function getTelephonyProvider(providerName: string = 'twilio'): TelephonyProvider {
  const factory = providers[providerName?.toLowerCase()];

  if (!factory) {
    console.warn(`⚠️ telephony_provider "${providerName}" desconocido, usando Twilio por defecto.`);
    return providers.twilio();
  }

  return factory();
}
