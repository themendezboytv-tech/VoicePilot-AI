"use server";

import { redirect } from "next/navigation";
import { setSessionCookies, clearSessionCookies, getRefreshToken } from "@/lib/session";
import { BACKEND_URL } from "@/lib/api";

export interface AuthFormState {
  error?: string;
}

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { error: body.error ?? "No pudimos iniciar sesión." };
  }

  await setSessionCookies(body.accessToken, body.refreshToken);
  redirect("/dashboard");
}

export async function registerAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const business_name = String(formData.get("business_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!business_name || !email || !password) {
    return { error: "Completá todos los campos." };
  }

  if (password !== passwordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_name, email, password }),
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { error: body.error ?? "No pudimos crear la cuenta." };
  }

  await setSessionCookies(body.accessToken, body.refreshToken);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    }).catch(() => {});
  }

  await clearSessionCookies();
  redirect("/login");
}
