"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { RecordItem } from "@/lib/types";

export interface UpdateStatusState {
  error?: string;
  success?: boolean;
}

export async function updateRecordStatusAction(
  recordId: string,
  _prevState: UpdateStatusState,
  formData: FormData
): Promise<UpdateStatusState> {
  const status = String(formData.get("status") ?? "");

  if (!status) {
    return { error: "Elegí un estado." };
  }

  try {
    await apiFetch<{ data: RecordItem }>(`/api/records/${recordId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos actualizar el estado." };
  }

  revalidatePath(`/registros/${recordId}`);
  revalidatePath("/registros");
  revalidatePath("/dashboard");

  return { success: true };
}
