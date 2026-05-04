import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData, captureStage } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (captureStage(session.capture) !== "running") {
    return NextResponse.json({ error: "no running session" }, { status: 409 });
  }

  session.capture = {
    ...session.capture!,
    endedAt: Date.now(),
  };
  await session.save();
  return NextResponse.json({ capture: session.capture });
}
