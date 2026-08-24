import { apiFetch } from "@/lib/api";
import type { Assistant, ListResponse, Tenant } from "@/lib/types";
import { CreateAssistantForm, EditAssistantForm } from "./assistant-form";

export default async function AsistentePage() {
  const [assistants, tenants] = await Promise.all([
    apiFetch<ListResponse<Assistant>>("/api/assistants"),
    apiFetch<ListResponse<Tenant>>("/api/tenants"),
  ]);

  const assistant = assistants.data[0];
  const tenant = tenants.data[0];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración del asistente</h1>
        <p className="text-sm text-muted-foreground">Guion, precios, horarios y notificaciones</p>
      </div>

      {assistant && tenant ? <EditAssistantForm assistant={assistant} tenant={tenant} /> : <CreateAssistantForm />}
    </div>
  );
}
