// ==============================================================================
// MIDDLEWARE: Autenticación
// Proyecto: VoicePilot AI
// Descripción: Exige un JWT de acceso válido (header Authorization: Bearer
// <token>) y cuelga su payload decodificado en req.user. No golpea la base
// de datos en cada request a propósito: el token de acceso vive 15 minutos,
// así que confiar en sus claims (tenant_id, role) sin re-chequear contra
// users en cada llamada es un trade-off aceptado (ver auth.service.ts).
// ==============================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta el header Authorization con el token de acceso' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token de acceso inválido o expirado' });
  }
}
