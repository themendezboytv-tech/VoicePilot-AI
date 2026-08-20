## 🚀 Proyecto VoicePilot AI - Documentación Maestra

## 🎯 Propósito del Proyecto
VoicePilot AI es un motor backend inteligente diseñado para ofrecer **atención al cliente automatizada de alta calidad por llamadas de voz**. Actúa como el cerebro central que orquesta la comunicación entre las llamadas telefónicas de los clientes finales y un motor de inteligencia artificial (IA).

El sistema está diseñado para mantener conversaciones fluidas, recordar el contexto inmediato del usuario mediante memoria caché ultrarrápida (Redis) y registrar de forma persistente cada interacción en la base de datos sin requerir intervención técnica manual.

## 💼 Modelo de Negocio
VoicePilot AI es una plataforma **SaaS multi-tenant (multiempresa)**: cada negocio (Tenant) contrata el servicio y configura su propio Asistente de IA (prompt, saludo, número de teléfono) sin tocar código. El objetivo es que la plataforma genere ingresos recurrentes vendiendo "recepcionistas de IA" a negocios que hoy dependen de contestar el teléfono manualmente.

## 🔌 Filosofía "Provider-Agnostic" (importante)
VoicePilot **no debe depender de un único proveedor** de telefonía ni de un único proveedor de IA. La arquitectura se diseña con una capa de abstracción ("providers") para que:

- **Telefonía:** hoy puede ser Twilio, pero mañana puede ser Vonage, Plivo, o el SIP propio de un cliente — sin tocar la lógica central del negocio.
- **Inteligencia Artificial:** hoy puede usar Gemini, mañana OpenAI (u otro), de forma intercambiable por Tenant.

Esto evita el vendor lock-in y permite ofrecer VoicePilot como una API abierta a la que otros proveedores/integradores se puedan conectar.

## 🏗️ Arquitectura y Alojamiento
El ecosistema completo está alojado y orquestado dentro del servidor **Vps-Casero** (Linux Debian), combinando procesos nativos y contenedores.

* **Backend Engine:** Aplicación en Node.js (Express + TypeScript) administrada a través de **PM2** bajo el proceso `voicepilot-backend`.
* **Almacenamiento Persistente (PostgreSQL):** Corre en el contenedor Docker `alpha_database`. Guarda la configuración de la empresa (Tenants), los Asistentes y el registro histórico de llamadas (Calls).
* **Memoria Conversacional (Redis):** Corre en el contenedor Docker `alpha_cache`. Mantiene el contexto a corto plazo para que la IA recuerde el hilo de la conversación con cada usuario.
* **Repositorio Oficial:** Alojado en GitHub bajo `themendezboytv-tech/VoicePilot-AI`.

## 📡 Estado Real del Motor (actualizado)
> Esta sección refleja lo que **realmente** existe en el código, no el objetivo final. Se actualiza a medida que se avanza.

- ✅ API REST de Tenants, Assistants y Calls (CRUD básico sobre PostgreSQL).
- ✅ Integración de IA funcionando con **Gemini** (`services/gemini.service.ts`), con memoria de conversación en Redis.
- ⚠️ **Conocido:** `schema.sql` no coincide con lo que esperan los controllers (`tenants` no tiene `slug`/`plan`/`is_active`; `assistants` no tiene `greeting_message`/`voice_id`/`phone_number`). Pendiente de corregir antes de usar en producción.
- ❌ **Sin integración de telefonía todavía.** El endpoint `/api/ai` recibe y responde **texto**, no audio de llamadas reales. No hay webhook de Twilio ni de ningún otro proveedor conectado.
- ❌ Sin capa de abstracción de providers (IA y telefonía) todavía — es la próxima pieza de arquitectura a construir.
- ❌ Sin panel web ni sistema de facturación/planes.

## ⚙️ Guía de Puesta en Marcha (Despliegue)
Gracias al sistema de autoconfiguración de esquemas, actualizar y lanzar el proyecto es un proceso estandarizado. Ejecuta estos pasos desde la ruta `~/servers/VoicePilot-AI/backend`:

1. **Descargar la última versión del repositorio:** `git pull origin main`
2. **Instalar dependencias de Node:** `npm install`
3. **Compilar el código de TypeScript a JavaScript:** `npm run build`
4. **Reiniciar el servicio (Esto ejecuta automáticamente el migrador de DB):** `pm2 restart voicepilot-backend`
5. **Verificar la salud del sistema:** `pm2 logs voicepilot-backend --lines 20`