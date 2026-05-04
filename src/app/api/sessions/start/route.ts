import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData, ActivityId, captureStage } from "@/lib/session";

export const dynamic = "force-dynamic";

const VALID_ACTIVITIES: ActivityId[] = ["reading", "smoking"];

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const stage = captureStage(session.capture);
  if (stage !== "idle") {
    return NextResponse.json(
      { error: `cannot start while stage=${stage}`, capture: session.capture },
      { status: 409 }
    );
  }

  let activity: ActivityId = "reading";
  try {
    const body = (await request.json()) as { activity?: string };
    if (body?.activity && VALID_ACTIVITIES.includes(body.activity as ActivityId)) {
      activity = body.activity as ActivityId;
    }
  } catch {
    // No body or invalid JSON — fall back to reading.
  }

  session.capture = { startedAt: Date.now(), activity };
  await session.save();
  return NextResponse.json({ capture: session.capture });
}
