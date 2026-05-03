"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CaptureState, CaptureStage } from "@/lib/session";

interface Props {
  initialCapture: CaptureState | null;
}

const ACTIVITIES = [
  { id: "reading", label: "Reading", accent: "var(--color-reading)", contrast: false, enabled: true },
  { id: "meditation", label: "Meditation", accent: "var(--color-meditation)", contrast: false, enabled: false },
  { id: "smoking", label: "Smoking", accent: "var(--color-smoking)", contrast: true, enabled: false },
] as const;

type ActivityId = (typeof ACTIVITIES)[number]["id"];

export function Tracker({ initialCapture }: Props) {
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState | null>(initialCapture);
  const [activeId] = useState<ActivityId>("reading");
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const stage: CaptureStage = !capture ? "idle" : capture.endedAt ? "finished" : "running";
  const activity = ACTIVITIES.find((a) => a.id === activeId)!;
  const accent = activity.accent;

  useEffect(() => {
    if (stage !== "running") return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const elapsedMs =
    stage === "running" && capture
      ? Math.max(0, now - capture.startedAt)
      : stage === "finished" && capture && capture.endedAt
      ? capture.endedAt - capture.startedAt
      : 0;

  const callApi = async (path: string, onSuccess: (data: { capture: CaptureState | null }) => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "request failed");
      onSuccess(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => callApi("/api/sessions/start", (d) => setCapture(d.capture));
  const handleStop = () => callApi("/api/sessions/stop", (d) => setCapture(d.capture));
  const handleSend = () =>
    callApi("/api/sessions/send", () => {
      setCapture(null);
      startTransition(() => router.refresh());
    });

  const handleAction = stage === "idle" ? handleStart : stage === "running" ? handleStop : handleSend;

  const startedAt = capture?.startedAt ?? null;
  const endedAt = capture?.endedAt ?? null;

  return (
    <div className="flex flex-1 flex-col">
      {/* Activity selector */}
      <div className="flex border-b-2 border-ink">
        {ACTIVITIES.map((a, i) => {
          const sel = a.id === activeId;
          const disabled = stage !== "idle" || !a.enabled;
          const isLast = i === ACTIVITIES.length - 1;
          return (
            <button
              key={a.id}
              disabled={disabled}
              className="flex-1 px-[6px] py-[14px] text-[11px] font-bold uppercase tracking-[2px] disabled:cursor-default"
              style={{
                background: sel ? a.accent : "var(--color-bg)",
                color: sel ? (a.contrast ? "var(--color-bg)" : "var(--color-ink)") : "var(--color-ink)",
                opacity: !a.enabled && !sel ? 0.32 : 1,
                borderRight: isLast ? "none" : "2px solid var(--color-ink)",
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Hero timer */}
      <div className="flex-1 px-[18px] pt-[34px] pb-2">
        <div className="text-[9px] font-bold tracking-[2.4px] mb-1.5">
          {stage === "idle" && "○ READY — TAP TO START"}
          {stage === "running" && "● RECORDING"}
          {stage === "finished" && "■ COMPLETE — REVIEW"}
        </div>

        <HeroTimer ms={elapsedMs} accent={accent} />

        <div className="text-[10px] font-bold tracking-[2.4px] mt-2 text-dim">
          {elapsedMs >= 3_600_000 ? "HH : MM : SS" : "MM : SS"}
        </div>

        {/* divider strip */}
        <div className="flex h-2 mt-4">
          <div className="flex-1 bg-ink" />
          <div className="flex-1" style={{ background: accent }} />
          <div className="flex-1 bg-ink" />
          <div className="flex-1" style={{ background: accent }} />
        </div>

        {/* time blocks */}
        <div className="grid grid-cols-2">
          <div className="border-r-2 border-b-2 border-ink py-[14px] pr-[14px]">
            <div className="text-[9px] font-bold tracking-[2px]">START</div>
            <TimeBlock at={startedAt} />
          </div>
          <div className="border-b-2 border-ink py-[14px] pl-[14px]">
            <div
              className="text-[9px] font-bold tracking-[2px]"
              style={{ color: endedAt ? "var(--color-ink)" : "var(--color-dim)" }}
            >
              END
            </div>
            <TimeBlock at={endedAt} />
          </div>
        </div>
      </div>

      {/* Big action button */}
      <div className="px-[18px] pt-6 pb-12">
        <ActionButton
          stage={stage}
          accent={accent}
          contrast={activity.contrast}
          busy={busy}
          onClick={handleAction}
        />
        {error && <p className="mt-3 text-[11px] tracking-[1px] text-reading">! {error}</p>}
      </div>
    </div>
  );
}

function HeroTimer({ ms, accent }: { ms: number; accent: string }) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      className="flex items-baseline text-[84px] leading-[0.9] font-medium tabular-nums"
      style={{
        color: accent,
        letterSpacing: "-4px",
        textShadow: "3px 3px 0 var(--color-ink)",
      }}
    >
      {h > 0 && (
        <>
          <span>{pad(h)}</span>
          <span className="opacity-55">:</span>
        </>
      )}
      <span>{pad(m)}</span>
      <span className="opacity-55">:</span>
      <span>{pad(s)}</span>
    </div>
  );
}

function TimeBlock({ at }: { at: number | null }) {
  return (
    <div
      className="text-[28px] font-bold tabular-nums mt-1"
      style={{
        color: at ? "var(--color-ink)" : "var(--color-faint)",
        letterSpacing: "-1px",
      }}
    >
      {at ? formatClockShort(new Date(at)) : "—:—"}
    </div>
  );
}

function ActionButton({
  stage,
  accent,
  contrast,
  busy,
  onClick,
}: {
  stage: CaptureStage;
  accent: string;
  contrast: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const isStop = stage === "running";
  const isSend = stage === "finished";

  const bg = isStop ? "var(--color-ink)" : accent;
  const fg = isStop
    ? accent
    : contrast
    ? "var(--color-bg)"
    : "var(--color-ink)";
  const shadowColor = contrast && !isStop ? "var(--color-reading)" : "var(--color-ink)";

  const label = isSend ? "SEND →" : isStop ? "■ STOP" : "START";
  const tracking = isSend ? "5px" : "6px";

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full h-[84px] text-[22px] font-bold uppercase border-2 border-ink disabled:opacity-60 disabled:cursor-default"
      style={{
        background: bg,
        color: fg,
        letterSpacing: tracking,
        boxShadow: `6px 6px 0 ${shadowColor}`,
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

function formatClockShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
