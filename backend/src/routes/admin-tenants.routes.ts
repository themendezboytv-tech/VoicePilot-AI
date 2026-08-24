// ==============================================================================
// RUTAS: Tenants desde VoicePilot Admin
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { listTenants, getTenantDetail, updateTenantAsAdmin } from '../controllers/admin-tenants.controller';
import { requireSuperAdmin } from '../middleware/admin-auth.middleware';

const router = Router();

router.get('/', requireSuperAdmin, listTenants);
router.get('/:id', requireSuperAdmin, getTenantDetail);
router.patch('/:id', requireSuperAdmin, updateTenantAsAdmin);

export default router;
