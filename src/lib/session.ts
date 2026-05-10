import type { SessionOptions } from "iron-session";

export type ActivityId = "reading" | "smoking" | "meditation" | "music";

export interface CaptureState {
  startedAt: number;
  endedAt?: number;
  activity?: ActivityId;
}

export interface SessionData {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  capture?: CaptureState;
}

export type CaptureStage = "idle" | "running" | "finished";

export function captureStage(capture: CaptureState | undefined): CaptureStage {
  if (!capture) return "idle";
  return capture.endedAt ? "finished" : "running";
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "qs-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  },
};
