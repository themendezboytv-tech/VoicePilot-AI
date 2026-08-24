// ==============================================================================
// RUTAS: Records (Pedidos, turnos, reservas...)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { createRecord, getRecords, getRecordById, updateRecordStatus } from '../controllers/record.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Listar records de la empresa autenticada (GET /api/records?status=...&channel=...)
router.get('/', requireAuth, getRecords);

// Crear un nuevo record para la empresa autenticada (POST /api/records)
router.post('/', requireAuth, createRecord);

// Obtener un record puntual, si pertenece a la empresa autenticada (GET /api/records/:id)
router.get('/:id', requireAuth, getRecordById);

// Actualizar el status de un record de la empresa autenticada (PATCH /api/records/:id/status)
router.patch('/:id/status', requireAuth, updateRecordStatus);

export default router;
