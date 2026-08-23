// ==============================================================================
// RUTAS: Records (Pedidos, turnos, reservas...)
// Proyecto: VoicePilot AI
// ==============================================================================

import { Router } from 'express';
import { createRecord, getRecords, getRecordById, updateRecordStatus } from '../controllers/record.controller';

const router = Router();

// Listar records de una empresa (GET /api/records?tenant_id=...)
router.get('/', getRecords);

// Crear un nuevo record (POST /api/records)
router.post('/', createRecord);

// Obtener un record puntual (GET /api/records/:id)
router.get('/:id', getRecordById);

// Actualizar el status de un record (PATCH /api/records/:id/status)
router.patch('/:id/status', updateRecordStatus);

export default router;
