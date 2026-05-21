import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { startSmokingPack } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const NOTE_MAX_LEN = 4000;
const FUTURE_TOLERANCE_MS = 60_000;

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: { note?: unknown; cigaretteCount?: unknown; startedAt?: unknown } = {};
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    // Empty body is fine — every field is optional.
  }

  const note =
    typeof body.note === "string"
      ? body.note.trim().slice(0, NOTE_MAX_LEN) || null
      : null;

  let cigaretteCount: number | null = null;
  if (typeof body.cigaretteCount === "number" && Number.isFinite(body.cigaretteCount)) {
    const n = Math.trunc(body.cigaretteCount);
    if (n > 0) cigaretteCount = n;
  }

  let startedAt: string | undefined;
  if (typeof body.startedAt === "string") {
    const ms = Date.parse(body.startedAt);
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ error: "invalid startedAt" }, { status: 400 });
    }
    if (ms > Date.now() + FUTURE_TOLERANCE_MS) {
      return NextResponse.json({ error: "startedAt cannot be in the future" }, { status: 400 });
    }
    startedAt = new Date(ms).toISOString();
  }

  const result = await startSmokingPack({ note, cigaretteCount, startedAt });
  if (!result.ok) {
    const status = result.error === "another pack already open" ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ pack: result.pack });
}
