// ==============================================================================
// RUTAS: Tenants (Empresas)
// Proyecto: VoicePilot AI
// Descripción: Define los endpoints HTTP para la gestión de empresas.
// ==============================================================================

import { Router } from 'express';
import { createTenant, getTenants } from '../controllers/tenant.controller';

const router = Router();

// Endpoint para obtener todas las empresas (GET /api/tenants)
router.get('/', getTenants);

// Endpoint para registrar una nueva empresa (POST /api/tenants)
router.post('/', createTenant);

export default router;