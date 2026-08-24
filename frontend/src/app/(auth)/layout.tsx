export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">VoicePilot AI</h1>
          <p className="text-sm text-muted-foreground">Panel de cliente</p>
        </div>
        {children}
      </div>
    </div>
  );
}
