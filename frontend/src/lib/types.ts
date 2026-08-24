// Tipos que reflejan la forma de las respuestas del backend (VoicePilot-AI/backend).
// Mantener en sync a mano con migrator.ts / los controllers — no hay
// generación automática de tipos entre los dos repos.

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  business_type: string | null;
  account_status: string;
  delivery_whatsapp_number: string | null;
  created_at: string;
}

export interface Assistant {
  id: string;
  tenant_id: string;
  name: string;
  system_prompt: string;
  greeting_message: string;
  voice_id: string;
  phone_number: string | null;
  ai_provider: string;
  telephony_provider: string;
  captures_records: boolean;
  default_record_type: string;
  pricing_info: Record<string, string>;
  business_hours: Record<string, string>;
  created_at: string;
}

export type RecordStatus = "received" | "in_progress" | "ready" | "completed" | "cancelled";

export interface RecordItem {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  interaction_id: string | null;
  record_type: string;
  status: RecordStatus;
  channel: string;
  contact_name: string | null;
  contact_identifier: string | null;
  data: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  caller_number: string | null;
  call_sid: string | null;
  duration_seconds: number;
  status: string;
  transcript: string | null;
  channel: string;
  created_at: string;
}

export interface ListResponse<T> {
  total: number;
  data: T[];
}
