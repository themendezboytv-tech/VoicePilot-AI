import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Todavía no hay endpoint de recuperación de contraseña en el backend
// (decisión de producto: diferido hasta el primer cliente real, ver
// CLAUDE.md). Esta página existe porque el boceto de páginas la incluye,
// pero es un placeholder honesto en vez de un formulario que no hace nada.
export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>
          Todavía no está disponible. Escribinos y te ayudamos a recuperar el acceso a mano
          mientras tanto.
        </CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/login" />}>
          Volver a iniciar sesión
        </Button>
      </CardFooter>
    </Card>
  );
}
