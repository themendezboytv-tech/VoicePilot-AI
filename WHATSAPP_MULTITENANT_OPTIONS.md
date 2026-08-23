# WhatsApp multi-tenant: opciones (investigación, sin implementar)

Fecha: 2026-08-23. Escrito como parte de la tarea 4 de la lista autónoma del
2026-08-23 — investigación pedida explícitamente, **sin tocar código**. La
decisión final (qué camino tomar, y cuándo) queda para el usuario.

## Contexto

Hoy VoicePilot tiene un canal de WhatsApp **provisorio y single-tenant**: un
solo número personal, conectado vía `whatsapp-unificado` (Baileys, no
oficial), atendiendo a un único assistant de prueba
(`WHATSAPP_DEV_ASSISTANT_ID`) — ver `backend/CLAUDE.md`. El producto final
necesita que **cada tenant conecte su propio número de WhatsApp**. Hay dos
caminos técnicos radicalmente distintos para eso, y no son solo una
decisión técnica: implican riesgo de negocio distinto.

## Opción A — API oficial de WhatsApp Business (Meta)

Dos formas de acceder a la misma API oficial:
- **Directo con Meta (Cloud API)**: gratis de acceder, pegás contra los
  servidores de Meta vía REST, vos manejás todo (webhooks, templates,
  tokens) sin intermediario.
- **Vía un BSP (Business Solution Provider)** como Twilio o 360dialog: te
  dan un panel/API más simple, a cambio de un markup.

### Costos (según lo que encontré, verificar al momento de decidir — los
precios de Meta cambian con frecuencia)
- Desde julio 2025, Meta pasó de "precio por conversación" a **precio por
  mensaje entregado**, con la tarifa variando por categoría (marketing,
  utility, authentication) y por país — hasta 13× de diferencia entre
  países y 6× entre categorías. Ejemplo citado: tarifa de marketing en EE.UU.
  ~$0.025 por mensaje.
- **Los mensajes de servicio (una respuesta tuya dentro de la ventana de
  24h desde que el cliente te escribió) son gratis.** Esto es relevante
  para VoicePilot: la confirmación al cliente (tarea 3 de hoy) cae en esta
  categoría casi siempre, porque se manda como respuesta inmediata al
  mensaje del cliente — costo $0.
- Fuera de esa ventana de 24h (ej. una notificación proactiva, un
  recordatorio, o notificarle al repartidor — que no es "el cliente" que
  escribió, así que probablemente no hay ventana abierta con él) hace
  falta un **template pre-aprobado por Meta**, y ahí sí se cobra por
  categoría.
- Con BSP: Twilio agrega ~$0.005/mensaje sobre la tarifa de Meta; 360dialog
  cobra una cuota fija (~49 EUR/mes) sin markup por mensaje, pero sin panel
  ni CRM incluido (es API pura, como Meta directo).

### Requisitos / fricción de onboarding
- Verificación de negocio en Meta Business Manager (nombre legal, domicilio
  fiscal, email corporativo, sitio web) — por **cada tenant**, ya que cada
  uno necesita su propio número verificado.
- Verificación del número de teléfono del tenant.
- Aprobación de templates de Meta para cualquier mensaje fuera de la
  ventana de 24h (puede tardar horas/días la primera vez).
- Esto es fricción real para el onboarding self-service que busca el
  producto (ver `ROADMAP.md`, Fase 5) — cada cliente nuevo necesita pasar
  por este proceso antes de poder usar el canal.

### Límites técnicos
- Rate limits por "tier de calidad" del número (empieza bajo, sube con uso
  legítimo y buena tasa de respuesta/bajo bloqueo de usuarios).
- No hay riesgo de baneo por usar la API como está pensada — es el canal
  soportado oficialmente.

### Pros / Contras para VoicePilot
- ✅ Legal, estable, soportado — sin riesgo de que un tenant pierda su
  canal de un día para el otro.
- ✅ La mayoría de los mensajes de VoicePilot (respuestas a algo que el
  cliente final escribió) caen en la ventana gratis de 24h.
- ❌ Fricción de onboarding por tenant (verificación de negocio, templates).
- ❌ Costo real y no trivial para mensajes proactivos fuera de ventana
  (ej. notificar al repartidor, que no es el "cliente" que escribió).
- ❌ Rehacer la integración desde cero: hoy todo el código de WhatsApp
  (`whatsapp.controller.ts`, `whatsapp-unificado.client.ts`) está pensado
  para el contrato de `whatsapp-unificado`/Baileys, no para webhooks/
  templates de Meta — es una integración nueva, no una extensión.

## Opción B — Baileys, una instancia por tenant

Cada tenant tiene su propia instancia de Baileys (como `whatsapp-unificado`
hoy, pero un proceso — o al menos una sesión — por tenant), usando su
propio número personal/de negocio escaneado por QR.

### Costos
- Sin costo por mensaje — es gratis en ese sentido.
- Costo de infraestructura: cada instancia consume RAM/CPU y necesita su
  propio directorio de sesión (`auth_info`, como el que ya existe para
  `whatsapp-unificado` — son cientos de archivos de claves de sesión, no
  es liviano). Con varios tenants activos en el mismo VPS, esto escala
  linealmente y hay que dimensionarlo.

### Riesgo — el punto central de esta opción
- **Usar Baileys viola los Términos de Servicio de WhatsApp**, sin importar
  qué tan legítimo sea el contenido de los mensajes — es el hecho de
  reversar el protocolo lo que está prohibido, no el uso que se le dé.
- Riesgo real y documentado de **baneo permanente del número, sin aviso
  previo**. Una fuente citada: 68% de negocios en India que usan
  automatización no oficial de WhatsApp reportaron al menos un baneo en 12
  meses; vida útil típica antes de detección, 2 a 8 semanas.
- Para un SaaS que le vende a un negocio real "tu asistente de IA atiende
  WhatsApp", un baneo significa que ese tenant se queda sin canal de un
  día para el otro — un problema de producto serio, no solo técnico.
- Ya se vio hoy mismo, en la instancia única de `whatsapp-unificado`,
  inestabilidad de conexión real (7+ reconexiones en una ventana corta,
  errores de sesión Signal) — con N tenants, esto se multiplica.
- Fricción de onboarding humana también existe acá: cada tenant tiene que
  escanear un código QR con su propio teléfono para conectar su cuenta —
  no es self-service sin intervención, es un paso manual por cliente.

### Pros / Contras para VoicePilot
- ✅ Sin costo por mensaje.
- ✅ Reutiliza casi todo el código ya construido hoy (`whatsapp.controller.ts`,
  `conversation.service.ts`, `whatsapp-unificado.client.ts`) — solo
  cambiaría cómo se identifica/rutea cada instancia por tenant.
- ❌ Riesgo de baneo real y no controlable por VoicePilot — depende de
  detección del lado de Meta/WhatsApp, imposible de garantizar que no pase.
- ❌ No es lo que la fuente consultada recomienda para "messaging real
  business use at scale" — el uso recomendado para Baileys es prototipos,
  automatización personal, un número propio y controlado (que es
  justamente lo que es hoy: un canal de desarrollo/pruebas).
- ❌ Fricción operativa de mantener N sesiones vivas simultáneas.

## Lo que no se investigó (fuera de alcance de esta tarea)

- Costos exactos y actualizados al momento de decidir (los precios de Meta
  cambian; lo de acá es una foto de agosto 2026, hay que reverificar).
- Alternativas híbridas (ej. Baileys para prueba gratuita inicial de un
  tenant nuevo, migración a API oficial una vez que el tenant confirma que
  quiere seguir) — es una idea de producto, no evaluada en profundidad acá.
- Impacto en el modelo de datos si se elige la oficial: como mínimo haría
  falta una tabla o columnas nuevas para credenciales/tokens de WhatsApp
  por tenant (hoy no existe nada así — ni siquiera hay un
  `assistants.whatsapp_number`), y una forma de rutear el webhook único de
  Meta al assistant correcto por número destino, similar a como
  `telephony.controller.ts` ya rutea por `assistants.phone_number` en voz.

## Nota de honestidad sobre esta investigación

Los datos de precios y riesgo de arriba vienen de búsquedas web hechas hoy
(agosto 2026) contra blogs de terceros y foros — no contra la
documentación oficial de Meta directamente citada con URLs verificadas
línea por línea. Son una buena primera aproximación para decidir si vale
la pena profundizar, pero antes de comprometer presupuesto o arquitectura
a esto, conviene confirmar los números exactos contra
`developers.facebook.com/documentation/business-messaging/whatsapp/pricing`
directamente.
