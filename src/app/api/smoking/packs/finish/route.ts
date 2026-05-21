import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { finishCurrentSmokingPack } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FUTURE_TOLERANCE_MS = 60_000;

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: { finishedAt?: unknown } = {};
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    // Empty body is fine — defaults to now().
  }

  let finishedAt: string | undefined;
  if (typeof body.finishedAt === "string") {
    const ms = Date.parse(body.finishedAt);
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ error: "invalid finishedAt" }, { status: 400 });
    }
    if (ms > Date.now() + FUTURE_TOLERANCE_MS) {
      return NextResponse.json({ error: "finishedAt cannot be in the future" }, { status: 400 });
    }
    finishedAt = new Date(ms).toISOString();
  }

  const result = await finishCurrentSmokingPack({ finishedAt });
  if (!result.ok) {
    const status =
      result.error === "no pack currently open"
        ? 409
        : result.error.startsWith("finishedAt")
        ? 400
        : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ pack: result.pack });
}
