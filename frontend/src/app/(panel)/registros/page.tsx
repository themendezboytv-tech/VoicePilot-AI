import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { ListResponse, RecordItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS, STATUS_BADGE_VARIANT, RECORD_STATUS_OPTIONS, recordSummary } from "@/lib/record-display";

interface SearchParams {
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
}

export default async function RegistrosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;

  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.channel) query.set("channel", filters.channel);
  if (filters.from) query.set("from", new Date(filters.from).toISOString());
  if (filters.to) query.set("to", new Date(`${filters.to}T23:59:59`).toISOString());

  const records = await apiFetch<ListResponse<RecordItem>>(`/api/records?${query.toString()}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registros</h1>
        <p className="text-sm text-muted-foreground">Historial completo de pedidos y turnos</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid grid-cols-2 gap-3 md:grid-cols-5" method="get">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="status">
                Estado
              </label>
              <select
                id="status"
                name="status"
                defaultValue={filters.status ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todos</option>
                {RECORD_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="channel">
                Canal
              </label>
              <select
                id="channel"
                name="channel"
                defaultValue={filters.channel ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="voice">Voz</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="web_chat">Chat web</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="from">
                Desde
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={filters.from ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="to">
                Hasta
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={filters.to ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Filtrar
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay registros con esos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                records.data.map((record) => (
                  <TableRow key={record.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/registros/${record.id}`} className="block">
                        {new Date(record.created_at).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/registros/${record.id}`} className="block">
                        {record.contact_name ?? record.contact_identifier ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/registros/${record.id}`} className="block max-w-xs truncate">
                        {recordSummary(record)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.channel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[record.status]}>{STATUS_LABELS[record.status]}</Badge>
                    </TableCell>
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
