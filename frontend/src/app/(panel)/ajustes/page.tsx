import { apiFetch } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { ListResponse, Tenant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TenantForm } from "./tenant-form";

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  demo: "Cuenta demo — pendiente de aprobación",
  active: "Cuenta activa",
};

export default async function AjustesPage() {
  const [tenants, user] = await Promise.all([apiFetch<ListResponse<Tenant>>("/api/tenants"), getSessionUser()]);
  const tenant = tenants.data[0];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes de cuenta</h1>
        <p className="text-sm text-muted-foreground">Datos del negocio, usuarios y facturación</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del negocio</CardTitle>
          {tenant ? (
            <Badge variant={tenant.account_status === "demo" ? "secondary" : "default"} className="w-fit">
              {ACCOUNT_STATUS_LABELS[tenant.account_status] ?? tenant.account_status}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent>{tenant ? <TenantForm tenant={tenant} /> : null}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios con acceso</CardTitle>
          <CardDescription>Próximamente vas a poder invitar más usuarios a tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
            <Badge variant="outline">Vos</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="opacity-60">
        <CardHeader>
          <CardTitle>Facturación</CardTitle>
          <CardDescription>Próximamente.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
