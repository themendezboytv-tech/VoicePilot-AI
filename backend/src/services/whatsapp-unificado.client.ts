// ==============================================================================
// CLIENTE: whatsapp-unificado (INTEGRACIÓN PROVISORIA)
// Proyecto: VoicePilot AI
// Descripción: whatsapp-unificado es un proceso Node/Baileys aparte (otro
// repo, mismo servidor Vps-Casero) que ya sirve a otros proyectos
// (programación de mensajes y entrega de claves DPSK vía wifi-hermano-bot).
// Expone un número de WhatsApp PERSONAL compartido, no un recurso
// multi-tenant de VoicePilot. Este cliente solo reusa el endpoint
// POST /send que YA existe ahí (mismo contrato que usa wifi-hermano-bot),
// sin modificar nada de whatsapp-unificado para el envío saliente.
//
// Esto es explícitamente temporal/single-tenant: sirve para conectar UN
// número de WhatsApp (el personal del dueño) como canal de desarrollo/
// pruebas del asistente de IA. El producto final necesita que cada tenant
// conecte su propio número — vía WhatsApp Business API oficial o una
// instancia de Baileys por tenant, decisión pendiente y fuera de esta
// tarea. No asumas en código nuevo que este número le pertenece a
// VoicePilot como plataforma.
// ==============================================================================

const WHATSAPP_UNIFICADO_URL = process.env.WHATSAPP_UNIFICADO_URL || 'http://127.0.0.1:3001';
const WHATSAPP_UNIFICADO_SECRET = process.env.WHATSAPP_UNIFICADO_SECRET || '';

/**
 * Manda un mensaje de WhatsApp a través de whatsapp-unificado, reusando el
 * endpoint POST /send que ya usa wifi-hermano-bot (mismo contrato:
 * {telefono, mensaje} + header X-Secret). `telefono` acepta el mismo
 * formato que ya acepta ese endpoint (con o sin +, con o sin espacios —
 * whatsapp-unificado se encarga de normalizarlo a JID).
 */
export async function sendWhatsappUnificadoMessage(telefono: string, mensaje: string): Promise<void> {
  const response = await fetch(`${WHATSAPP_UNIFICADO_URL}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret': WHATSAPP_UNIFICADO_SECRET
    },
    body: JSON.stringify({ telefono, mensaje })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`whatsapp-unificado respondió ${response.status} al intentar enviar el mensaje: ${body}`);
  }
}
