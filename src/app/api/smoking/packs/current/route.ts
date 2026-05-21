import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getCurrentSmokingPack, countSessionsForPack } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const pack = await getCurrentSmokingPack();
  if (!pack) {
    return NextResponse.json({ pack: null, smokedCount: 0 });
  }
  const smokedCount = await countSessionsForPack(pack.id);
  return NextResponse.json({ pack, smokedCount });
}
