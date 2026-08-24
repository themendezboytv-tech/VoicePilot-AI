import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { ListResponse, RecordItem, CallLog, RecordStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { recordSummary, STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/record-display";

const BOARD_COLUMNS: RecordStatus[] = ["received", "in_progress", "ready", "completed"];

function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function DashboardPage() {
  const { from, to } = todayRange();

  const [records, calls] = await Promise.all([
    apiFetch<ListResponse<RecordItem>>(`/api/records?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    apiFetch<ListResponse<CallLog>>(`/api/calls?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  ]);

  const byStatus = BOARD_COLUMNS.reduce<Record<RecordStatus, RecordItem[]>>((acc, status) => {
    acc[status] = records.data.filter((record) => record.status === status);
    return acc;
  }, {} as Record<RecordStatus, RecordItem[]>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hoy</h1>
        <p className="text-sm text-muted-foreground">Resumen del día</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos hoy</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{records.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Llamadas / mensajes</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{calls.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En preparación</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{byStatus.in_progress.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Listos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{byStatus.ready.length}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {BOARD_COLUMNS.map((status) => (
          <div key={status} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              {STATUS_LABELS[status]}
              <Badge variant="outline">{byStatus[status].length}</Badge>
            </h2>
            <div className="space-y-2">
              {byStatus[status].length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin registros.</p>
              ) : (
                byStatus[status].map((record) => (
                  <Link key={record.id} href={`/registros/${record.id}`}>
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="space-y-1 p-3">
                        <p className="text-sm font-medium">{recordSummary(record)}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{record.contact_name ?? record.contact_identifier ?? "Sin nombre"}</span>
                          <Badge variant={STATUS_BADGE_VARIANT[record.status]} className="text-[10px]">
                            {record.channel}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
