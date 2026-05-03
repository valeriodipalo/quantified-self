import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData, captureStage } from "@/lib/session";
import { refreshAccessToken } from "@/lib/google/oauth";
import { createCalendarEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (captureStage(session.capture) !== "finished") {
    return NextResponse.json({ error: "no finished session to send" }, { status: 409 });
  }

  let accessToken = session.accessToken;
  const expiresAt = session.accessTokenExpiresAt ?? 0;
  if (!accessToken || Date.now() >= expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    accessToken = refreshed.access_token;
    session.accessToken = accessToken;
    session.accessTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
  }

  const start = new Date(session.capture!.startedAt);
  const end = new Date(session.capture!.endedAt!);

  const event = await createCalendarEvent({
    accessToken: accessToken as string,
    calendarId: process.env.GOOGLE_CALENDAR_ID as string,
    summary: "Reading",
    start,
    end,
    description: `Tracked via Quantified Self · ${Math.round((end.getTime() - start.getTime()) / 60000)} min`,
  });

  session.capture = undefined;
  await session.save();

  return NextResponse.json({
    event: { id: event.id, htmlLink: event.htmlLink },
    durationMs: end.getTime() - start.getTime(),
  });
}
