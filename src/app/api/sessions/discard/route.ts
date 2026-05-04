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
  if (captureStage(session.capture) !== "finished") {
    return NextResponse.json({ error: "no finished session to discard" }, { status: 409 });
  }

  session.capture = undefined;
  await session.save();
  return NextResponse.json({ capture: null });
}
