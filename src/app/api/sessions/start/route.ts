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
  const stage = captureStage(session.capture);
  if (stage !== "idle") {
    return NextResponse.json(
      { error: `cannot start while stage=${stage}`, capture: session.capture },
      { status: 409 }
    );
  }

  session.capture = { startedAt: Date.now() };
  await session.save();
  return NextResponse.json({ capture: session.capture });
}
