import { redirect } from "next/navigation";

// El gateo real de auth lo hace proxy.ts (optimistic check). Esta página
// nunca se renderiza para un usuario sin sesión — solo decide a dónde
// mandar a alguien que llega a "/" con sesión.
export default function Home() {
  redirect("/dashboard");
}
