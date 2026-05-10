"use client";

import type { ButtonHTMLAttributes, TouchEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActivityId, CaptureState, CaptureStage } from "@/lib/session";

interface Props {
  initialCapture: CaptureState | null;
}

const ACTIVITIES = [
  { id: "reading", label: "Reading", accent: "var(--color-reading)", contrast: false, enabled: true },
  { id: "meditation", label: "Meditation", accent: "var(--color-meditation)", contrast: false, enabled: false },
  { id: "smoking", label: "Smoking", accent: "var(--color-smoking)", contrast: true, enabled: true },
] as const;

export function Tracker({ initialCapture }: Props) {
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState | null>(initialCapture);
  const [activeId, setActiveId] = useState<ActivityId>(
    initialCapture?.activity ?? "reading"
  );
  const [now, setNow] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
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

  const callApi = async (
    label: string,
    path: string,
    body: Record<string, unknown> | null,
    onSuccess: (data: { capture: CaptureState | null }) => void
  ) => {
    setBusy(true);
    setError(null);
    setDebug(`${label} · …`);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: { capture?: CaptureState | null; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // non-JSON response (e.g. HTML error page) — leave data empty
      }
      if (!res.ok) {
        const msg = data?.error || `http ${res.status}`;
        setDebug(`${label} · ${res.status} · ${msg}`);
        throw new Error(msg);
      }
      setDebug(`${label} · ${res.status} · ok`);
      onSuccess(data as { capture: CaptureState | null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setError(msg);
      setDebug((prev) => prev ?? `${label} · — · ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () =>
    callApi("start", "/api/sessions/start", { activity: activeId }, (d) =>
      setCapture(d.capture)
    );
  const handleStop = () =>
    callApi("stop", "/api/sessions/stop", null, (d) => setCapture(d.capture));
  const handleSend = () =>
    callApi("send", "/api/sessions/send", null, () => {
      setCapture(null);
      startTransition(() => router.refresh());
    });
  const handleDiscard = () =>
    callApi("discard", "/api/sessions/discard", null, () => setCapture(null));

  const handleAction = () => {
    setDebug(`tap · ${stage}`);
    const fn = stage === "idle" ? handleStart : stage === "running" ? handleStop : handleSend;
    fn();
  };

  const onDiscardTap = () => {
    setDebug("tap · discard");
    handleDiscard();
  };

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
            <ReliableButton
              key={a.id}
              type="button"
              disabled={disabled}
              onPress={() => setActiveId(a.id as ActivityId)}
              className="flex-1 px-[6px] py-[14px] text-[11px] font-bold uppercase tracking-[2px] disabled:cursor-default"
              style={{
                background: sel ? a.accent : "var(--color-bg)",
                color: sel ? (a.contrast ? "var(--color-bg)" : "var(--color-ink)") : "var(--color-ink)",
                opacity: !a.enabled && !sel ? 0.32 : 1,
                borderRight: isLast ? "none" : "2px solid var(--color-ink)",
                touchAction: "manipulation",
              }}
            >
              {a.label}
            </ReliableButton>
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
      <div className="px-[18px] pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-3">
          <ActionButton
            stage={stage}
            accent={accent}
            contrast={activity.contrast}
            busy={busy}
            onClick={handleAction}
          />
          {stage === "finished" && (
            <DiscardButton
              accent={accent}
              contrast={activity.contrast}
              busy={busy}
              onClick={onDiscardTap}
            />
          )}
        </div>
        {error && <p className="mt-3 text-[11px] tracking-[1px] text-reading">! {error}</p>}
        {debug && (
          <p className="mt-2 text-[10px] tabular-nums tracking-[1px] text-dim break-all">
            ▸ {debug}
          </p>
        )}
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
    <ReliableButton
      type="button"
      onPress={onClick}
      disabled={busy}
      className="flex-1 h-[84px] text-[22px] font-bold uppercase border-2 border-ink disabled:opacity-60 disabled:cursor-default"
      style={{
        background: bg,
        color: fg,
        letterSpacing: tracking,
        boxShadow: `6px 6px 0 ${shadowColor}`,
        touchAction: "manipulation",
      }}
    >
      {busy ? "…" : label}
    </ReliableButton>
  );
}

function DiscardButton({
  accent,
  contrast,
  busy,
  onClick,
}: {
  accent: string;
  contrast: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const bg = accent;
  const fg = contrast ? "var(--color-bg)" : "var(--color-ink)";
  const shadowColor = contrast ? "var(--color-reading)" : "var(--color-ink)";

  return (
    <ReliableButton
      type="button"
      onPress={onClick}
      disabled={busy}
      aria-label="Discard"
      className="h-[84px] w-[84px] shrink-0 text-[28px] font-bold uppercase border-2 border-ink disabled:opacity-60 disabled:cursor-default"
      style={{
        background: bg,
        color: fg,
        boxShadow: `6px 6px 0 ${shadowColor}`,
        touchAction: "manipulation",
      }}
    >
      {busy ? "…" : "X"}
    </ReliableButton>
  );
}

type ReliableButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onPress: () => void;
};

const TAP_MOVE_TOLERANCE_PX = 12;

function ReliableButton({
  onPress,
  disabled,
  onTouchStart,
  onTouchEnd,
  ...props
}: ReliableButtonProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchPressRef = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchStart?.(event);
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchEnd?.(event);
    if (event.defaultPrevented || disabled) return;

    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const moved =
      Math.abs(touch.clientX - start.x) > TAP_MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - start.y) > TAP_MOVE_TOLERANCE_PX;
    if (moved) return;

    lastTouchPressRef.current = Date.now();
    event.preventDefault();
    event.currentTarget.blur();
    onPress();
  };

  return (
    <button
      {...props}
      disabled={disabled}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (Date.now() - lastTouchPressRef.current < 700) return;
        onPress();
      }}
    />
  );
}

function formatClockShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
