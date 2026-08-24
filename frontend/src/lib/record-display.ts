import type { RecordItem, RecordStatus } from "./types";

export const STATUS_LABELS: Record<RecordStatus, string> = {
  received: "Recibido",
  in_progress: "Preparando",
  ready: "Listo",
  completed: "Entregado",
  cancelled: "Cancelado",
};

export const STATUS_BADGE_VARIANT: Record<RecordStatus, "default" | "secondary" | "destructive" | "outline"> = {
  received: "outline",
  in_progress: "secondary",
  ready: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export const RECORD_STATUS_OPTIONS: RecordStatus[] = [
  "received",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
];

/**
 * data es JSONB libre (ver record.controller.ts en el backend) — no hay
 * schema fijo por vertical de negocio. Heurística simple para mostrar algo
 * legible en las listas sin asumir campos que puede que no existan.
 */
export function recordSummary(record: RecordItem): string {
  const data = record.data ?? {};

  if (typeof data.items === "string" && data.items.trim()) {
    return data.items;
  }
  if (typeof data.summary === "string" && data.summary.trim()) {
    return data.summary;
  }

  const entries = Object.entries(data).filter(([, value]) => typeof value === "string" || typeof value === "number");
  if (entries.length > 0) {
    return entries
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");
  }

  return record.record_type;
}
