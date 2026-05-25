import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getSmokingSessions } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const date = params.get("date") ?? undefined;
  const limit = params.has("limit") ? Number(params.get("limit")) : undefined;

  const sessions = await getSmokingSessions({ date, limit });
  return NextResponse.json({ sessions });
}
