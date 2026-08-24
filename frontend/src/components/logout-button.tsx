import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
        <LogOut className="size-4" />
        Cerrar sesión
      </Button>
    </form>
  );
}
