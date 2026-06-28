import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getCurrentSmokingPack, logResist, getResistData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// `dayStart` is the client's local midnight (epoch ms) so "today" counters
// follow the user's timezone. Falls back to UTC midnight if absent/invalid.
function parseDayStart(input: string | null): number {
  if (input) {
    const n = Number(input);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function POST(request: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let dayStartRaw: string | null = null;
  try {
    const body = (await request.json()) as { dayStart?: unknown };
    if (typeof body?.dayStart === "number") dayStartRaw = String(body.dayStart);
    else if (typeof body?.dayStart === "string") dayStartRaw = body.dayStart;
  } catch {
    // No body — dayStart falls back to UTC midnight.
  }
  const dayStartMs = parseDayStart(dayStartRaw);

  const pack = await getCurrentSmokingPack();
  const result = await logResist({ packId: pack?.id ?? null });
  if (!result.ok) {
    // Don't hard-fail the tap on a logging error; return current (likely zero)
    // stats so the UI stays responsive. Surfaced in server logs.
    console.error("[smoking/resist] logResist failed:", result.error);
  }

  const data = await getResistData({ dayStartMs });
  return NextResponse.json(data);
}

export async function GET(request: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const dayStartMs = parseDayStart(request.nextUrl.searchParams.get("dayStart"));
  const data = await getResistData({ dayStartMs });
  return NextResponse.json(data);
}
