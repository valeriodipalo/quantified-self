import type { SessionOptions } from "iron-session";

export interface SessionData {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  activeSessionStart?: number;
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
