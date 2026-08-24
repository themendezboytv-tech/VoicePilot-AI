"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export interface TenantFormState {
  error?: string;
  success?: boolean;
}

export async function updateTenantAction(
  tenantId: string,
  _prevState: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const business_type = String(formData.get("business_type") ?? "").trim();

  if (!name) {
    return { error: "El nombre del negocio es obligatorio." };
  }

  try {
    await apiFetch<{ data: Tenant }>(`/api/tenants/${tenantId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, business_type: business_type || null }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos guardar los cambios." };
  }

  revalidatePath("/ajustes");
  return { success: true };
}
