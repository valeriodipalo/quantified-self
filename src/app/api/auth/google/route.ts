import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(buildAuthUrl());
}
