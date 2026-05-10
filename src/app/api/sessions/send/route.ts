import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData, ActivityId, captureStage } from "@/lib/session";
import { applyCap } from "@/lib/activity-caps";
import { refreshAccessToken } from "@/lib/google/oauth";
import { createCalendarEvent } from "@/lib/google/calendar";
import { logSession } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ACTIVITY_CONFIG: Record<ActivityId, { summary: string; calendarEnv: string }> = {
  reading: { summary: "Reading", calendarEnv: "GOOGLE_READING_CALENDAR_ID" },
  smoking: { summary: "Smoking", calendarEnv: "GOOGLE_SMOKING_CALENDAR_ID" },
  meditation: { summary: "Meditation", calendarEnv: "GOOGLE_MEDITATION_CALENDAR_ID" },
};

const FEEDBACK_MAX_LEN = 4000;

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (captureStage(session.capture) !== "finished") {
    return NextResponse.json({ error: "no finished session to send" }, { status: 409 });
  }

  let feedback: string | null = null;
  try {
    const body = (await request.json()) as { feedback?: unknown };
    if (typeof body?.feedback === "string") {
      const trimmed = body.feedback.trim().slice(0, FEEDBACK_MAX_LEN);
      feedback = trimmed.length > 0 ? trimmed : null;
    }
  } catch {
    // No body — fine, feedback stays null.
  }

  let accessToken = session.accessToken;
  const expiresAt = session.accessTokenExpiresAt ?? 0;
  if (!accessToken || Date.now() >= expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    accessToken = refreshed.access_token;
    session.accessToken = accessToken;
    session.accessTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
  }

  const startedAt = session.capture!.startedAt;
  const rawEndedAt = session.capture!.endedAt!;
  const activity: ActivityId = session.capture!.activity ?? "reading";
  const { summary, calendarEnv } = ACTIVITY_CONFIG[activity];
  const calendarId = process.env[calendarEnv] ?? process.env.GOOGLE_CALENDAR_ID;

  if (!calendarId) {
    return NextResponse.json(
      { error: `missing calendar id (set ${calendarEnv} or GOOGLE_CALENDAR_ID)` },
      { status: 500 }
    );
  }

  const { endedAt, capped } = applyCap(activity, startedAt, rawEndedAt);
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const durationMs = endedAt - startedAt;
  const durationMin = Math.round(durationMs / 60000);
  const description =
    `Tracked via Quantified Self · ${durationMin} min${capped ? " (capped)" : ""}` +
    (feedback ? `\n\n${feedback}` : "");

  const event = await createCalendarEvent({
    accessToken: accessToken as string,
    calendarId,
    summary,
    start,
    end,
    description,
  });

  session.capture = undefined;
  await session.save();

  // Log to Supabase. Don't fail the request if this errors — the calendar
  // event is already created and that's the user-visible commit.
  const logResult = await logSession({
    activity,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_ms: durationMs,
    capped,
    feedback,
    google_event_id: event.id ?? null,
    google_calendar_id: calendarId,
  });
  if (!logResult.ok) {
    console.error("[sessions/send] supabase log failed:", logResult.error);
  }

  return NextResponse.json({
    event: { id: event.id, htmlLink: event.htmlLink },
    durationMs,
    capped,
    logged: logResult.ok,
  });
}
