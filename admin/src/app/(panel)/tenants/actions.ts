'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api';
import type { TenantDetail } from '@/lib/types';

export interface TenantActionState {
  error?: string;
  success?: boolean;
}

async function patchTenant(tenantId: string, body: Record<string, unknown>): Promise<TenantActionState> {
  try {
    await apiFetch<{ data: TenantDetail }>(`/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No pudimos guardar los cambios.' };
  }

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath('/tenants');
  return { success: true };
}

/**
 * Cubre aprobar (-> active), suspender y reactivar: son todos el mismo
 * cambio de account_status, solo cambia el valor destino.
 */
export async function setAccountStatusAction(
  tenantId: string,
  status: 'demo' | 'active' | 'suspended',
  // useActionState exige esta firma (prevState, formData) aunque acá no se
  // use ninguno de los dos — el cambio no depende de nada del formulario.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: TenantActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<TenantActionState> {
  return patchTenant(tenantId, { account_status: status });
}

export async function setDemoExpirationAction(
  tenantId: string,
  _prevState: TenantActionState,
  formData: FormData
): Promise<TenantActionState> {
  const demoExpiresAt = String(formData.get('demo_expires_at') ?? '').trim();

  if (!demoExpiresAt) {
    return { error: 'Elegí una fecha.' };
  }

  return patchTenant(tenantId, {
    account_status: 'demo',
    demo_expires_at: new Date(`${demoExpiresAt}T23:59:59`).toISOString(),
  });
}

export async function setPlanAction(
  tenantId: string,
  _prevState: TenantActionState,
  formData: FormData
): Promise<TenantActionState> {
  const plan = String(formData.get('plan') ?? '').trim();

  if (!plan) {
    return { error: 'El plan no puede quedar vacío.' };
  }

  return patchTenant(tenantId, { plan });
}
