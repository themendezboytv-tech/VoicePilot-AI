import { getSessionAdmin } from '@/lib/session';
import { LogoutButton } from '@/components/logout-button';
import { SessionRefresher } from '@/components/session-refresher';
import { ShieldAlert } from 'lucide-react';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await getSessionAdmin();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <SessionRefresher />
      <header className="flex items-center justify-between border-b bg-muted/20 px-6 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          <span className="font-semibold">VoicePilot Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{admin?.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 space-y-6 p-6">{children}</main>
    </div>
  );
}
