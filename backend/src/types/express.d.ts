import { AccessTokenPayload } from '../services/auth.service';
import { AdminAccessTokenPayload } from '../services/admin-auth.service';

// Amplía Request de Express para que req.user (cliente) y req.superAdmin
// (VoicePilot Admin) existan tipados en todo el proyecto, después de pasar
// por requireAuth o requireSuperAdmin respectivamente. Son campos distintos
// a propósito — nunca conviven en el mismo request, ver
// docs/design-voicepilot-admin.md.
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      superAdmin?: AdminAccessTokenPayload;
    }
  }
}

export {};
