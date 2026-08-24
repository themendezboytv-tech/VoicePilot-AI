import { AccessTokenPayload } from '../services/auth.service';

// Amplía Request de Express para que req.user exista tipado en todo el
// proyecto después de pasar por requireAuth (ver middleware/auth.middleware.ts).
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
