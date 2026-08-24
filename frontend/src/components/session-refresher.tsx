"use client";

import { useEffect } from "react";

// Cada 10 minutos (el access token dura 15) pide renovar la sesión en
// segundo plano, para que el usuario no tenga que volver a loguearse cada
// 15 minutos mientras navega el panel. Ver app/api/refresh/route.ts.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/refresh", { method: "POST" }).catch(() => {
        // Si falla, el próximo fetch protegido del panel va a devolver 401
        // y apiFetch() redirige a /login — no hace falta manejarlo acá.
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return null;
}
