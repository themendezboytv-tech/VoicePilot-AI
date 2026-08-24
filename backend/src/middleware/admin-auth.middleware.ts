// ==============================================================================
// MIDDLEWARE: Autenticación de VoicePilot Admin
// Proyecto: VoicePilot AI
// Descripción: Exige un JWT de acceso de ADMIN válido (firmado con
// ADMIN_JWT_SECRET, nunca con el JWT_SECRET del panel de cliente) y cuelga
// su payload en req.superAdmin. Estructuralmente separado de
// auth.middleware.ts — un token de cliente no puede pasar esta
// verificación bajo ninguna circunstancia, sin importar sus claims.
// ==============================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyAdminAccessToken } from '../services/admin-auth.service';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta el header Authorization con el token de acceso de admin' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    req.superAdmin = verifyAdminAccessToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token de acceso de admin inválido o expirado' });
  }
}
