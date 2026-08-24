'use client';

import { useActionState } from 'react';
import { setAccountStatusAction, setDemoExpirationAction, setPlanAction, type TenantActionState } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { AccountStatus } from '@/lib/types';

const initialState: TenantActionState = {};

export function AccountStatusActions({ tenantId, currentStatus }: { tenantId: string; currentStatus: AccountStatus }) {
  const activateAction = setAccountStatusAction.bind(null, tenantId, 'active');
  const suspendAction = setAccountStatusAction.bind(null, tenantId, 'suspended');

  const [activateState, activateFormAction, activatePending] = useActionState(activateAction, initialState);
  const [suspendState, suspendFormAction, suspendPending] = useActionState(suspendAction, initialState);
  const [demoState, demoFormAction, demoPending] = useActionState(setDemoExpirationAction.bind(null, tenantId), initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de la cuenta</CardTitle>
        <CardDescription>Aprobar, suspender/reactivar, o marcar demo con vencimiento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <form action={activateFormAction}>
            <Button type="submit" disabled={activatePending || currentStatus === 'active'}>
              {activatePending ? 'Activando...' : 'Activar / aprobar'}
            </Button>
          </form>
          <form action={suspendFormAction}>
            <Button type="submit" variant="destructive" disabled={suspendPending || currentStatus === 'suspended'}>
              {suspendPending ? 'Suspendiendo...' : 'Suspender'}
            </Button>
          </form>
        </div>
        {activateState.error ? <p className="text-sm text-destructive">{activateState.error}</p> : null}
        {suspendState.error ? <p className="text-sm text-destructive">{suspendState.error}</p> : null}

        <div className="border-t pt-4">
          <form action={demoFormAction} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="demo_expires_at" className="text-xs text-muted-foreground">
                Marcar como demo con vencimiento
              </Label>
              <Input id="demo_expires_at" name="demo_expires_at" type="date" className="w-auto" />
            </div>
            <Button type="submit" variant="outline" disabled={demoPending}>
              {demoPending ? 'Guardando...' : 'Marcar demo'}
            </Button>
          </form>
          {demoState.error ? <p className="mt-1 text-sm text-destructive">{demoState.error}</p> : null}
          {demoState.success ? <p className="mt-1 text-sm text-emerald-600">Actualizado.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlanForm({ tenantId, currentPlan }: { tenantId: string; currentPlan: string }) {
  const [state, formAction, isPending] = useActionState(setPlanAction.bind(null, tenantId), initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
        <CardDescription>Campo de texto libre — todavía no hay una estructura de planes definida.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="plan" className="text-xs text-muted-foreground">
              Plan
            </Label>
            <Input id="plan" name="plan" defaultValue={currentPlan} />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </form>
        {state.error ? <p className="mt-1 text-sm text-destructive">{state.error}</p> : null}
        {state.success ? <p className="mt-1 text-sm text-emerald-600">Guardado.</p> : null}
      </CardContent>
    </Card>
  );
}
