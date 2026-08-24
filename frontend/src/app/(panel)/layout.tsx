import { getSessionUser } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import type { ListResponse, Tenant } from "@/lib/types";
import { SidebarNav } from "@/components/sidebar-nav";
import { LogoutButton } from "@/components/logout-button";
import { SessionRefresher } from "@/components/session-refresher";
import { Badge } from "@/components/ui/badge";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const tenants = await apiFetch<ListResponse<Tenant>>("/api/tenants");
  const tenant = tenants.data[0];

  return (
    <div className="flex min-h-screen flex-1">
      <SessionRefresher />
      <aside className="hidden w-56 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
        <div className="border-b p-4">
          <p className="text-sm font-semibold leading-tight">{tenant?.name ?? "VoicePilot AI"}</p>
          {tenant?.account_status === "demo" ? (
            <Badge variant="secondary" className="mt-1">
              Cuenta demo
            </Badge>
          ) : null}
        </div>
        <SidebarNav />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm text-muted-foreground">{user?.email}</div>
          <LogoutButton />
        </header>
        <main className="flex-1 space-y-6 p-6">{children}</main>
      </div>
    </div>
  );
}
