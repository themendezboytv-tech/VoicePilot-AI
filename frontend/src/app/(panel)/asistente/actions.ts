"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { Assistant, Tenant } from "@/lib/types";

export interface AssistantFormState {
  error?: string;
  success?: boolean;
}

function parseJsonField(formData: FormData, field: string): Record<string, string> {
  const raw = String(formData.get(field) ?? "{}");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function createAssistantAction(
  _prevState: AssistantFormState,
  formData: FormData
): Promise<AssistantFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const system_prompt = String(formData.get("system_prompt") ?? "").trim();
  const greeting_message = String(formData.get("greeting_message") ?? "").trim();

  if (!name || !system_prompt || !greeting_message) {
    return { error: "Completá nombre, guion y saludo." };
  }

  try {
    await apiFetch<{ data: Assistant }>("/api/assistants", {
      method: "POST",
      body: JSON.stringify({ name, system_prompt, greeting_message }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos crear el asistente." };
  }

  revalidatePath("/asistente");
  return { success: true };
}

export async function updateAssistantAction(
  assistantId: string,
  _prevState: AssistantFormState,
  formData: FormData
): Promise<AssistantFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const system_prompt = String(formData.get("system_prompt") ?? "").trim();
  const greeting_message = String(formData.get("greeting_message") ?? "").trim();
  const captures_records = formData.get("captures_records") === "on";
  const pricing_info = parseJsonField(formData, "pricing_info");
  const business_hours = parseJsonField(formData, "business_hours");
  const delivery_whatsapp_number = String(formData.get("delivery_whatsapp_number") ?? "").trim();

  if (!name || !system_prompt || !greeting_message) {
    return { error: "Completá nombre, guion y saludo." };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: "Tu sesión expiró. Volvé a iniciar sesión." };
  }

  try {
    await apiFetch<{ data: Assistant }>(`/api/assistants/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, system_prompt, greeting_message, captures_records, pricing_info, business_hours }),
    });

    await apiFetch<{ data: Tenant }>(`/api/tenants/${user.tenant_id}`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_whatsapp_number: delivery_whatsapp_number || null }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos guardar los cambios." };
  }

  revalidatePath("/asistente");
  return { success: true };
}
