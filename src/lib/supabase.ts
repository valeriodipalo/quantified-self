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
  start_note?: string | null;
  backdated?: boolean;
  pack_id?: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSession(row: SessionRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { ok: false, error: "supabase env not configured" };

  const payload = {
    ...row,
    start_note: row.start_note ?? null,
    backdated: row.backdated ?? false,
    pack_id: row.pack_id ?? null,
  };

  const { error } = await client.from("sessions").insert(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── smoking_packs ──────────────────────────────────────────────────────────

export interface SmokingPackRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  cigarette_count: number | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

type PackResult = { ok: true; pack: SmokingPackRow } | { ok: false; error: string };

export async function getCurrentSmokingPack(): Promise<SmokingPackRow | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client
    .from("smoking_packs")
    .select("*")
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[smoking_packs] getCurrent:", error.message);
    return null;
  }
  return (data as SmokingPackRow | null) ?? null;
}

export async function startSmokingPack(input: {
  note?: string | null;
  cigaretteCount?: number | null;
  startedAt?: string;
}): Promise<PackResult> {
  const client = getSupabaseAdmin();
  if (!client) return { ok: false, error: "supabase env not configured" };

  // Pre-check is best-effort UX. The DB partial unique index is the real
  // guarantor — if two requests race past this check, the second insert
  // will fail at the DB level.
  const existing = await getCurrentSmokingPack();
  if (existing) return { ok: false, error: "another pack already open" };

  const insert: Record<string, unknown> = {
    note: input.note ?? null,
    cigarette_count: input.cigaretteCount ?? null,
  };
  if (input.startedAt) insert.started_at = input.startedAt;

  const { data, error } = await client
    .from("smoking_packs")
    .insert(insert)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pack: data as SmokingPackRow };
}

export async function finishCurrentSmokingPack(input: {
  finishedAt?: string;
}): Promise<PackResult> {
  const client = getSupabaseAdmin();
  if (!client) return { ok: false, error: "supabase env not configured" };

  const pack = await getCurrentSmokingPack();
  if (!pack) return { ok: false, error: "no pack currently open" };

  const finishedAt = input.finishedAt ?? new Date().toISOString();
  if (new Date(finishedAt).getTime() < new Date(pack.started_at).getTime()) {
    return { ok: false, error: "finishedAt cannot be before pack started_at" };
  }

  const { data, error } = await client
    .from("smoking_packs")
    .update({ finished_at: finishedAt })
    .eq("id", pack.id)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pack: data as SmokingPackRow };
}

// Locate the pack whose lifespan contains `timestamp` (ISO string).
// Used to link smoking sessions to the pack they belong to.
export async function findPackContaining(timestamp: string): Promise<SmokingPackRow | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client
    .from("smoking_packs")
    .select("*")
    .lte("started_at", timestamp)
    .or(`finished_at.is.null,finished_at.gte.${timestamp}`)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[smoking_packs] findContaining:", error.message);
    return null;
  }
  return (data as SmokingPackRow | null) ?? null;
}

export async function countSessionsForPack(packId: string): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;
  const { count, error } = await client
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("pack_id", packId);
  if (error) {
    console.error("[sessions] countForPack:", error.message);
    return 0;
  }
  return count ?? 0;
}
