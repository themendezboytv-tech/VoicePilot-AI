"use client";

import { useActionState } from "react";
import { createAssistantAction, updateAssistantAction, type AssistantFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KeyValueEditor } from "@/components/key-value-editor";
import type { Assistant, Tenant } from "@/lib/types";

const initialState: AssistantFormState = {};

export function CreateAssistantForm() {
  const [state, formAction, isPending] = useActionState(createAssistantAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurá tu asistente</CardTitle>
        <CardDescription>Todavía no tenés un asistente. Creá el primero para empezar.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del asistente</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="greeting_message">Saludo inicial</Label>
            <Textarea id="greeting_message" name="greeting_message" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="system_prompt">Guion / personalidad</Label>
            <Textarea id="system_prompt" name="system_prompt" rows={6} required />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        </CardContent>
        <CardContent>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creando..." : "Crear asistente"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}

export function EditAssistantForm({ assistant, tenant }: { assistant: Assistant; tenant: Tenant }) {
  const action = updateAssistantAction.bind(null, assistant.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Guion y personalidad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del asistente</Label>
            <Input id="name" name="name" defaultValue={assistant.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="greeting_message">Saludo inicial</Label>
            <Textarea id="greeting_message" name="greeting_message" defaultValue={assistant.greeting_message} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="system_prompt">Guion / personalidad</Label>
            <Textarea id="system_prompt" name="system_prompt" rows={8} defaultValue={assistant.system_prompt} required />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="captures_records" name="captures_records" defaultChecked={assistant.captures_records} />
            <Label htmlFor="captures_records">Toma pedidos/turnos automáticamente</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precios y horarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <KeyValueEditor
            name="pricing_info"
            label="Precios / servicios"
            initialValue={assistant.pricing_info}
            keyPlaceholder="ej. pizza_muzzarella"
            valuePlaceholder="ej. 5000"
          />
          <KeyValueEditor
            name="business_hours"
            label="Horarios de atención"
            initialValue={assistant.business_hours}
            keyPlaceholder="ej. lun_vie"
            valuePlaceholder="ej. 09:00-22:00"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
          <CardDescription>WhatsApp del repartidor/staff que recibe el aviso de pedido listo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="delivery_whatsapp_number">Número de WhatsApp</Label>
          <Input
            id="delivery_whatsapp_number"
            name="delivery_whatsapp_number"
            defaultValue={tenant.delivery_whatsapp_number ?? ""}
            placeholder="+54 9 11 1234 5678"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Número de teléfono del asistente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{assistant.phone_number ?? "Todavía no tiene un número asignado."}</p>
          <p className="text-xs text-muted-foreground">
            Asignar o cambiar el número de teléfono requiere soporte de VoicePilot por ahora.
          </p>
        </CardContent>
      </Card>

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
