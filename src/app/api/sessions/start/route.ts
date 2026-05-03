import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (session.activeSessionStart) {
    return NextResponse.json(
      { error: "session already active", start: session.activeSessionStart },
      { status: 409 }
    );
  }

  session.activeSessionStart = Date.now();
  await session.save();
  return NextResponse.json({ start: session.activeSessionStart });
}
