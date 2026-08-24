"use client";

import { useActionState } from "react";
import { updateRecordStatusAction, type UpdateStatusState } from "../actions";
import { RECORD_STATUS_OPTIONS, STATUS_LABELS } from "@/lib/record-display";
import { Button } from "@/components/ui/button";
import type { RecordStatus } from "@/lib/types";

const initialState: UpdateStatusState = {};

export function StatusUpdateForm({ recordId, currentStatus }: { recordId: string; currentStatus: RecordStatus }) {
  const action = updateRecordStatusAction.bind(null, recordId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="status"
        defaultValue={currentStatus}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        {RECORD_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Guardando..." : "Actualizar estado"}
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.success ? <span className="text-sm text-emerald-600">Actualizado.</span> : null}
    </form>
  );
}
