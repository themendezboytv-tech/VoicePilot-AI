'use server';

import { redirect } from 'next/navigation';
import { setSessionCookies, clearSessionCookies, getRefreshToken } from '@/lib/session';
import { BACKEND_URL } from '@/lib/api';

export interface AuthFormState {
  error?: string;
}

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Completá email y contraseña.' };
  }

  const res = await fetch(`${BACKEND_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { error: body.error ?? 'No pudimos iniciar sesión.' };
  }

  await setSessionCookies(body.accessToken, body.refreshToken);
  redirect('/tenants');
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    await fetch(`${BACKEND_URL}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => {});
  }

  await clearSessionCookies();
  redirect('/login');
}
