import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { TenantDetail } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from '@/lib/account-status-display';
import { AccountStatusActions, PlanForm } from './tenant-actions';
import { ArrowLeft } from 'lucide-react';

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tenant: TenantDetail;
  try {
    const res = await apiFetch<{ data: TenantDetail }>(`/api/admin/tenants/${id}`);
    tenant = res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/tenants" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" />
        Volver a tenants
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {tenant.slug} · registrado el {new Date(tenant.created_at).toLocaleDateString('es-AR')}
          </p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[tenant.account_status]}>{STATUS_LABELS[tenant.account_status]}</Badge>
      </div>

      {tenant.demo_expires_at ? (
        <p className="text-sm text-muted-foreground">
          Demo con vencimiento: {new Date(tenant.demo_expires_at).toLocaleDateString('es-AR')}
        </p>
      ) : null}

      <AccountStatusActions tenantId={tenant.id} currentStatus={tenant.account_status} />
      <PlanForm tenantId={tenant.id} currentPlan={tenant.plan} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Pedidos/turnos</p>
            <p className="text-2xl font-semibold">{tenant.records_count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Llamadas/mensajes</p>
            <p className="text-2xl font-semibold">{tenant.calls_count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rubro</p>
            <p className="text-sm">{tenant.business_type ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">WhatsApp repartidor</p>
            <p className="text-sm">{tenant.delivery_whatsapp_number ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios ({tenant.users.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenant.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin usuarios todavía.</p>
          ) : (
            tenant.users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{user.email}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {user.role}
                  </Badge>
                  {!user.is_active ? <Badge variant="destructive">Inactivo</Badge> : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asistentes ({tenant.assistants.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenant.assistants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin asistentes configurados todavía.</p>
          ) : (
            tenant.assistants.map((assistant) => (
              <div key={assistant.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{assistant.name}</span>
                <span className="text-muted-foreground">{assistant.phone_number ?? 'sin número'}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
