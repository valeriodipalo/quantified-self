import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getSmokingDayCounts } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);
  const from =
    params.get("from") ??
    new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  const days = await getSmokingDayCounts(from, to);
  return NextResponse.json({ days });
}
