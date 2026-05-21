import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData, ActivityId } from "@/lib/session";
import { refreshAccessToken } from "@/lib/google/oauth";
import { createCalendarEvent } from "@/lib/google/calendar";
import { logSession, findPackContaining } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Backdated entry: caller provides startedAt/endedAt for a session that
// already happened. Unlike /start → /stop → /send, this never touches the
// iron-session capture state, so it can coexist with an in-flight live
// session without conflict.

const VALID_ACTIVITIES: ActivityId[] = ["reading", "smoking", "meditation", "music"];

const ACTIVITY_CONFIG: Record<ActivityId, { summary: string; calendarEnv: string }> = {
  reading: { summary: "Reading", calendarEnv: "GOOGLE_READING_CALENDAR_ID" },
  smoking: { summary: "Smoking", calendarEnv: "GOOGLE_SMOKING_CALENDAR_ID" },
  meditation: { summary: "Meditation", calendarEnv: "GOOGLE_MEDITATION_CALENDAR_ID" },
  music: { summary: "Music", calendarEnv: "GOOGLE_MUSIC_CALENDAR_ID" },
};

const NOTE_MAX_LEN = 4000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
// Allow a small clock-skew tolerance so a client clock 30s ahead of the
// server doesn't reject a "just-now" backdated entry.
const FUTURE_TOLERANCE_MS = 60_000;

function parseTs(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const ms = Date.parse(input);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

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

  let body: {
    activity?: string;
    startedAt?: unknown;
    endedAt?: unknown;
    startNote?: unknown;
    feedback?: unknown;
  };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.activity || !VALID_ACTIVITIES.includes(body.activity as ActivityId)) {
    return NextResponse.json({ error: "invalid activity" }, { status: 400 });
  }
  const activity = body.activity as ActivityId;

  const startedAt = parseTs(body.startedAt);
  const endedAt = parseTs(body.endedAt);
  if (startedAt == null || endedAt == null) {
    return NextResponse.json(
      { error: "startedAt and endedAt required (ISO string or epoch ms)" },
      { status: 400 }
    );
  }
  if (endedAt <= startedAt) {
    return NextResponse.json({ error: "endedAt must be after startedAt" }, { status: 400 });
  }
  const now = Date.now();
  if (endedAt > now + FUTURE_TOLERANCE_MS) {
    return NextResponse.json({ error: "endedAt cannot be in the future" }, { status: 400 });
  }
  const durationMs = endedAt - startedAt;
  if (durationMs > MAX_DURATION_MS) {
    return NextResponse.json(
      { error: `duration exceeds ${MAX_DURATION_MS / 3_600_000}h limit` },
      { status: 400 }
    );
  }

  const startNote = clipNote(body.startNote);
  const feedback = clipNote(body.feedback);

  const { summary, calendarEnv } = ACTIVITY_CONFIG[activity];
  const calendarId = process.env[calendarEnv] ?? process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return NextResponse.json(
      { error: `missing calendar id (set ${calendarEnv} or GOOGLE_CALENDAR_ID)` },
      { status: 500 }
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

  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const durationMin = Math.round(durationMs / 60000);

  const noteBlocks: string[] = [];
  if (startNote) noteBlocks.push(`note: ${startNote}`);
  if (feedback) noteBlocks.push(feedback);
  const description =
    `Tracked via Quantified Self · ${durationMin} min · backdated` +
    (noteBlocks.length ? `\n\n${noteBlocks.join("\n\n")}` : "");

  const event = await createCalendarEvent({
    accessToken: accessToken as string,
    calendarId,
    summary,
    start,
    end,
    description,
  });

  // Smoking only: link to whichever pack was open at the session's start time.
  let packId: string | null = null;
  if (activity === "smoking") {
    const pack = await findPackContaining(start.toISOString());
    packId = pack?.id ?? null;
  }

  const logResult = await logSession({
    activity,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_ms: durationMs,
    // Backdated entries skip the cap intentionally: the user is consciously
    // declaring an exact past duration. Caps only discourage runaway *live*
    // sessions.
    capped: false,
    feedback,
    start_note: startNote,
    backdated: true,
    pack_id: packId,
    google_event_id: event.id ?? null,
    google_calendar_id: calendarId,
  });
  if (!logResult.ok) {
    console.error("[sessions/log] supabase log failed:", logResult.error);
  }

  return NextResponse.json({
    event: { id: event.id, htmlLink: event.htmlLink },
    durationMs,
    backdated: true,
    packId,
    logged: logResult.ok,
  });
}
