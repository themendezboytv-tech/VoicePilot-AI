import type { AccountStatus } from './types';

export const STATUS_LABELS: Record<AccountStatus, string> = {
  demo: 'Demo',
  active: 'Activa',
  suspended: 'Suspendida',
};

export const STATUS_BADGE_VARIANT: Record<AccountStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  demo: 'secondary',
  active: 'default',
  suspended: 'destructive',
};

export const ACCOUNT_STATUS_OPTIONS: AccountStatus[] = ['demo', 'active', 'suspended'];
