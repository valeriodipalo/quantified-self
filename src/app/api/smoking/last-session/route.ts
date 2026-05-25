import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getLastSmokingSessionEnd } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const endedAt = await getLastSmokingSessionEnd();
  return NextResponse.json({ endedAt });
}
