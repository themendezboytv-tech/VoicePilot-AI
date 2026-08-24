"use client";

import { useActionState } from "react";
import { updateTenantAction, type TenantFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tenant } from "@/lib/types";

const initialState: TenantFormState = {};

export function TenantForm({ tenant }: { tenant: Tenant }) {
  const action = updateTenantAction.bind(null, tenant.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del negocio</Label>
        <Input id="name" name="name" defaultValue={tenant.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business_type">Rubro</Label>
        <Input
          id="business_type"
          name="business_type"
          defaultValue={tenant.business_type ?? ""}
          placeholder="ej. restaurant, peluquería"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.success ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
      </div>
    </form>
  );
}
