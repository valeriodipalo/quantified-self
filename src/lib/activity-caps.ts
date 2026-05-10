import type { ActivityId } from "./session";

export interface ActivityCap {
  thresholdMs: number;
  cappedMs: number;
}

export const ACTIVITY_CAPS: Record<ActivityId, ActivityCap | null> = {
  reading: { thresholdMs: 90 * 60_000, cappedMs: 45 * 60_000 },
  smoking: { thresholdMs: 10 * 60_000, cappedMs: 6 * 60_000 },
  meditation: null,
};

export function applyCap(
  activity: ActivityId,
  startedAt: number,
  endedAt: number
): { endedAt: number; capped: boolean } {
  const cap = ACTIVITY_CAPS[activity];
  if (!cap) return { endedAt, capped: false };
  if (endedAt - startedAt < cap.thresholdMs) return { endedAt, capped: false };
  return { endedAt: startedAt + cap.cappedMs, capped: true };
}
