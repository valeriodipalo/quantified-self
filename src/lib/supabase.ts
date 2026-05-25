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

export async function getLastSmokingSessionEnd(): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client
    .from("sessions")
    .select("ended_at")
    .eq("activity", "smoking")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[sessions] getLastSmokingEnd:", error.message);
    return null;
  }
  return (data as { ended_at: string } | null)?.ended_at ?? null;
}

// ─── smoking analytics ─────────────────────────────────────────────────

export async function getSmokingDayCounts(
  from: string,
  to: string,
): Promise<Array<{ date: string; count: number }>> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from("sessions")
    .select("started_at")
    .eq("activity", "smoking")
    .gte("started_at", `${from}T00:00:00Z`)
    .lte("started_at", `${to}T23:59:59Z`)
    .order("started_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("[sessions] dayCounts:", error.message);
    return [];
  }
  const map = new Map<string, number>();
  for (const row of data as Array<{ started_at: string }>) {
    const day = row.started_at.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return Array.from(map, ([date, count]) => ({ date, count }));
}

export interface SmokingSessionRow {
  id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  backdated: boolean;
  pack_id: string | null;
  start_note: string | null;
  feedback: string | null;
}

export async function getSmokingSessions(opts: {
  date?: string;
  limit?: number;
}): Promise<SmokingSessionRow[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  let query = client
    .from("sessions")
    .select("id, started_at, ended_at, duration_ms, backdated, pack_id, start_note, feedback")
    .eq("activity", "smoking")
    .order("started_at", { ascending: false });
  if (opts.date) {
    query = query
      .gte("started_at", `${opts.date}T00:00:00Z`)
      .lte("started_at", `${opts.date}T23:59:59Z`);
  }
  query = query.limit(opts.limit ?? 50);
  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error("[sessions] smokingSessions:", error.message);
    return [];
  }
  return data as SmokingSessionRow[];
}

export interface SmokingPackStat {
  id: string;
  started_at: string;
  finished_at: string | null;
  cigarette_count: number | null;
  tracked_count: number;
  note: string | null;
  duration_hours: number | null;
}

export async function getSmokingPackStats(
  limit: number = 10,
): Promise<SmokingPackStat[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data: packs, error } = await client
    .from("smoking_packs")
    .select("id, started_at, finished_at, cigarette_count, note")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error || !packs || packs.length === 0) {
    if (error) console.error("[smoking_packs] packStats:", error.message);
    return [];
  }
  return Promise.all(
    (packs as Array<Omit<SmokingPackStat, "tracked_count" | "duration_hours">>).map(
      async (pack) => {
        const tracked_count = await countSessionsForPack(pack.id);
        const duration_hours = pack.finished_at
          ? (new Date(pack.finished_at).getTime() -
              new Date(pack.started_at).getTime()) /
            3_600_000
          : null;
        return { ...pack, tracked_count, duration_hours };
      },
    ),
  );
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
