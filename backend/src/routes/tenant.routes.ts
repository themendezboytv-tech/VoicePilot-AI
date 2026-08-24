// ==============================================================================
// RUTAS: Tenants (Empresas)
// Proyecto: VoicePilot AI
// Descripción: Define los endpoints HTTP para la gestión de empresas.
// ==============================================================================

import { Router } from 'express';
import { createTenant, getTenants, getTenantById, updateTenant } from '../controllers/tenant.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Devuelve la propia empresa del usuario autenticado (GET /api/tenants)
router.get('/', requireAuth, getTenants);

// Endpoint para registrar una nueva empresa SIN usuario asociado
// (POST /api/tenants). Sin requireAuth a propósito, igual que antes — el
// flujo real de alta de negocios ahora es POST /api/auth/register (crea
// tenant + usuario juntos); este endpoint queda para altas administrativas
// futuras, no lo usa el panel de cliente.
router.post('/', createTenant);

// Detalle y edición de la propia empresa (Ajustes de cuenta / Configuración)
router.get('/:id', requireAuth, getTenantById);
router.patch('/:id', requireAuth, updateTenant);

export default router;