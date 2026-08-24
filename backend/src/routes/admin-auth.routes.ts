// ==============================================================================
// RUTAS: Autenticación de VoicePilot Admin
// Proyecto: VoicePilot AI
// Descripción: Namespace completamente separado de /api/auth (cliente). Sin
// registro público a propósito.
// ==============================================================================

import { Router } from 'express';
import { adminLogin, adminRefresh, adminLogout } from '../controllers/admin-auth.controller';

const router = Router();

router.post('/login', adminLogin);
router.post('/refresh', adminRefresh);
router.post('/logout', adminLogout);

export default router;
