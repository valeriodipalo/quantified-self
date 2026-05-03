import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { exchangeCodeForTokens } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(message)}`, req.url));
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (tokens.refresh_token) {
    session.refreshToken = tokens.refresh_token;
  }
  session.accessToken = tokens.access_token;
  session.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
  await session.save();

  return NextResponse.redirect(new URL("/", req.url));
}
