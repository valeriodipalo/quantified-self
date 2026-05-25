import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { getSmokingPackStats } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.refreshToken) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const limit = req.nextUrl.searchParams.has("limit")
    ? Number(req.nextUrl.searchParams.get("limit"))
    : 10;

  const packs = await getSmokingPackStats(limit);
  return NextResponse.json({ packs });
}
