// Tipos reflejando las respuestas de /api/admin/* del backend. Mantener en
// sync a mano con admin-tenants.controller.ts / migrator.ts.

export type AccountStatus = 'demo' | 'active' | 'suspended';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  business_type: string | null;
  account_status: AccountStatus;
  demo_expires_at: string | null;
  delivery_whatsapp_number: string | null;
  created_at: string;
  records_count: number;
  calls_count: number;
}

export interface TenantUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TenantAssistant {
  id: string;
  name: string;
  phone_number: string | null;
  ai_provider: string;
  telephony_provider: string;
  created_at: string;
}

export interface TenantDetail extends TenantSummary {
  users: TenantUser[];
  assistants: TenantAssistant[];
}

export interface ListResponse<T> {
  total: number;
  data: T[];
}
