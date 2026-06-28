import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { refreshAccessToken } from "@/lib/google/oauth";
import { createCalendarEvent } from "@/lib/google/calendar";
import { logSession, findPackContaining } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// One-tap cigarette log. No live stopwatch: every cigarette is a fixed 5-min
// event starting now. Mirrors /api/sessions/send but skips the capture state
// machine and the duration cap entirely.

const FIXED_DURATION_MS = 5 * 60_000;
const NOTE_MAX_LEN = 4000;

function clipNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, NOTE_MAX_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let note: string | null = null;
  try {
    const body = (await request.json()) as { note?: unknown };
    note = clipNote(body?.note);
  } catch {
    // No body — note stays null.
  }

  const calendarId =
    process.env.GOOGLE_SMOKING_CALENDAR_ID ?? process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return NextResponse.json(
      { error: "missing calendar id (set GOOGLE_SMOKING_CALENDAR_ID or GOOGLE_CALENDAR_ID)" },
      { status: 500 },
    );
  }

  let accessToken = session.accessToken;
  const expiresAt = session.accessTokenExpiresAt ?? 0;
  if (!accessToken || Date.now() >= expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    accessToken = refreshed.access_token;
    session.accessToken = accessToken;
    session.accessTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
    await session.save();
  }

  const startedAt = Date.now();
  const endedAt = startedAt + FIXED_DURATION_MS;
  const start = new Date(startedAt);
  const end = new Date(endedAt);

  const description =
    "Tracked via Quantified Self · 5 min" + (note ? `\n\nnote: ${note}` : "");

  const event = await createCalendarEvent({
    accessToken: accessToken as string,
    calendarId,
    summary: "Smoking",
    start,
    end,
    description,
  });

  const pack = await findPackContaining(start.toISOString());
  const packId = pack?.id ?? null;

  const logResult = await logSession({
    activity: "smoking",
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_ms: FIXED_DURATION_MS,
    capped: false,
    feedback: null,
    start_note: note,
    backdated: false,
    pack_id: packId,
    google_event_id: event.id ?? null,
    google_calendar_id: calendarId,
  });
  if (!logResult.ok) {
    console.error("[smoking/cigarette] supabase log failed:", logResult.error);
  }

  return NextResponse.json({
    event: { id: event.id, htmlLink: event.htmlLink },
    startedAt: start.toISOString(),
    packId,
    logged: logResult.ok,
  });
}
