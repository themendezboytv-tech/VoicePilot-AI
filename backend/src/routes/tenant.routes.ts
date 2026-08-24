// ==============================================================================
// RUTAS: Tenants (Empresas)
// Proyecto: VoicePilot AI
// Descripción: Define los endpoints HTTP para la gestión de empresas.
// ==============================================================================

import { Router } from 'express';
import { createTenant, getTenants } from '../controllers/tenant.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Devuelve la propia empresa del usuario autenticado (GET /api/tenants)
router.get('/', requireAuth, getTenants);

// Endpoint para registrar una nueva empresa (POST /api/tenants).
// A propósito sin requireAuth todavía: es el alta de un tenant nuevo, y
// todavía no está decidido el flujo de onboarding/registro de negocios
// (ver CLAUDE.md, pendientes conocidos). Mientras tanto sigue siendo un
// hueco de autorización conocido: cualquiera puede crear tenants.
router.post('/', createTenant);

export default router;