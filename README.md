## 🚀 Proyecto VoicePilot AI - Documentación Maestra

## 🎯 Propósito del Proyecto
VoicePilot AI es un motor backend inteligente diseñado para ofrecer **atención al cliente automatizada de alta calidad**. Actúa como el cerebro central que orquesta la comunicación entre usuarios finales (a través de canales como WhatsApp) y la inteligencia artificial de Google (**Gemini 3.1-Flash-Lite**). 

El sistema está diseñado para mantener conversaciones fluidas, recordar el contexto inmediato del usuario mediante memoria caché ultrarrápida y registrar de forma persistente cada interacción en la base de datos sin requerir intervención técnica manual.

## 🏗️ Arquitectura y Alojamiento
El ecosistema completo está alojado y orquestado dentro del servidor **Vps-Casero** (Linux Debian), combinando procesos nativos y contenedores.

*   **Backend Engine:** Aplicación en Node.js (Express + TypeScript) administrada a través de **PM2** bajo el proceso `voicepilot-backend`.
*   **Almacenamiento Persistente (PostgreSQL):** Corre en el contenedor Docker `alpha_database`. Guarda la configuración de la empresa (Tenants), los prompts de los Asistentes y el registro histórico completo (Calls).
*   **Memoria Conversacional (Redis):** Corre en el contenedor Docker `alpha_cache`. Mantiene el contexto a corto plazo para que la IA recuerde el hilo de la charla con cada usuario.
*   **Repositorio Oficial:** Alojado en GitHub bajo `themendezboytv-tech/VoicePilot-AI`.

## ⚙️ Guía de Puesta en Marcha (Despliegue)
Gracias al sistema de autoconfiguración de esquemas, actualizar y lanzar el proyecto es un proceso estandarizado. Ejecuta estos pasos desde la ruta `~/servers/VoicePilot-AI/backend`:

1.  **Descargar la última versión del repositorio:** `git pull origin main`
2.  **Instalar dependencias de Node:** `npm install`
3.  **Compilar el código de TypeScript a JavaScript:** `npm run build`
4.  **Reiniciar el servicio (Esto ejecuta automáticamente el migrador de DB):** `pm2 restart voicepilot-backend`
5.  **Verificar la salud del sistema:** `pm2 logs voicepilot-backend --lines 20`
