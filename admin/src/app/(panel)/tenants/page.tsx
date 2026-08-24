import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { ListResponse, TenantSummary } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from '@/lib/account-status-display';

export default async function TenantsPage() {
  const tenants = await apiFetch<ListResponse<TenantSummary>>('/api/admin/tenants');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground">{tenants.total} negocios registrados</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Llamadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Todavía no hay tenants registrados.
                  </TableCell>
                </TableRow>
              ) : (
                tenants.data.map((tenant) => (
                  <TableRow key={tenant.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/tenants/${tenant.id}`} className="block font-medium">
                        {tenant.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">{tenant.business_type ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[tenant.account_status]}>
                        {STATUS_LABELS[tenant.account_status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{tenant.plan}</TableCell>
                    <TableCell>{new Date(tenant.created_at).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell>{tenant.records_count}</TableCell>
                    <TableCell>{tenant.calls_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
