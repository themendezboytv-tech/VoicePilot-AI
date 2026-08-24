import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { RecordItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/record-display";
import { StatusUpdateForm } from "./status-update-form";
import { ArrowLeft } from "lucide-react";

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let record: RecordItem;
  try {
    const res = await apiFetch<{ data: RecordItem }>(`/api/records/${id}`);
    record = res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const dataEntries = Object.entries(record.data ?? {});

  return (
    <div className="space-y-6">
      <Link href="/registros" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" />
        Volver a registros
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {record.contact_name ?? record.contact_identifier ?? "Registro"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {record.record_type} · {new Date(record.created_at).toLocaleString("es-AR")}
          </p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[record.status]}>{STATUS_LABELS[record.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actualizar estado</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusUpdateForm recordId={record.id} currentStatus={record.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del pedido</CardTitle>
        </CardHeader>
        <CardContent>
          {dataEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos estructurados.</p>
          ) : (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {dataEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{key}</dt>
                  <dd className="text-sm">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacto y origen</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Canal</p>
            <p className="text-sm">{record.channel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contacto</p>
            <p className="text-sm">{record.contact_identifier ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última actualización</p>
            <p className="text-sm">{new Date(record.updated_at).toLocaleString("es-AR")}</p>
          </div>
        </CardContent>
      </Card>

      {record.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{record.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
