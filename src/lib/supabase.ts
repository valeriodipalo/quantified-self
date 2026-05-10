import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface SessionRow {
  activity: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  capped: boolean;
  feedback: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSession(row: SessionRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { ok: false, error: "supabase env not configured" };

  const { error } = await client.from("sessions").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
