"use client";

import type { ButtonHTMLAttributes, TouchEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActivityId, CaptureState, CaptureStage } from "@/lib/session";
import { ACTIVITY_CAPS } from "@/lib/activity-caps";

interface Props {
  initialCapture: CaptureState | null;
}

type Shape = "circle" | "square" | "diamond" | "triangle";

const ACTIVITIES = [
  { id: "reading", label: "Reading", accent: "var(--color-reading)", contrast: false, enabled: true, shape: "circle" satisfies Shape },
  { id: "meditation", label: "Meditation", accent: "var(--color-meditation)", contrast: true, enabled: true, shape: "square" satisfies Shape },
  { id: "smoking", label: "Smoking", accent: "var(--color-smoking)", contrast: true, enabled: true, shape: "diamond" satisfies Shape },
  { id: "music", label: "Music", accent: "var(--color-music)", contrast: true, enabled: true, shape: "triangle" satisfies Shape },
] as const;

type Activity = (typeof ACTIVITIES)[number];

type SheetPhase = "closed" | "opening" | "open" | "closing";

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
  const [feedback, setFeedback] = useState("");
  const [sheetPhase, setSheetPhase] = useState<SheetPhase>("closed");
  const [, startTransition] = useTransition();
  const capStopFiredRef = useRef<number | null>(null);

  useEffect(() => {
    if (sheetPhase === "opening") {
      const r = requestAnimationFrame(() => setSheetPhase("open"));
      return () => cancelAnimationFrame(r);
    }
    if (sheetPhase === "closing") {
      const t = setTimeout(() => setSheetPhase("closed"), 200);
      return () => clearTimeout(t);
    }
  }, [sheetPhase]);

  const openSheet = () => setSheetPhase("opening");
  const closeSheet = () => setSheetPhase("closing");

  const stage: CaptureStage = !capture ? "idle" : capture.endedAt ? "finished" : "running";
  const activity = ACTIVITIES.find((a) => a.id === activeId)!;
  const accent = activity.accent;
  const sessionActivity: ActivityId = capture?.activity ?? activeId;
  const sessionCap = ACTIVITY_CAPS[sessionActivity];

  const stripVisible = ACTIVITIES.slice(0, 3);
  const stripHidden = ACTIVITIES.slice(3);
  const overflowActive = stripHidden.find((a) => a.id === activeId);
  const strip: readonly Activity[] = overflowActive
    ? [stripVisible[0], stripVisible[1], overflowActive]
    : stripVisible;
  const selectorLocked = stage !== "idle";

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

  const willCap =
    stage === "finished" && !!sessionCap && elapsedMs >= sessionCap.thresholdMs;
  const cappedMinutes = sessionCap
    ? Math.round(sessionCap.cappedMs / 60_000)
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
    callApi("send", "/api/sessions/send", { feedback: feedback.trim() }, () => {
      setCapture(null);
      setFeedback("");
      startTransition(() => router.refresh());
    });
  const handleDiscard = () =>
    callApi("discard", "/api/sessions/discard", null, () => {
      setCapture(null);
      setFeedback("");
    });

  const handleAutoCap = async () => {
    setBusy(true);
    setError(null);
    setDebug("auto-cap · stop…");
    try {
      const stopRes = await fetch("/api/sessions/stop", { method: "POST" });
      const stopData: { capture?: CaptureState | null; error?: string } =
        await stopRes.json().catch(() => ({}));
      if (!stopRes.ok) {
        throw new Error(stopData?.error || `stop http ${stopRes.status}`);
      }
      setCapture(stopData.capture ?? null);
      setDebug("auto-cap · send…");
      const sendRes = await fetch("/api/sessions/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "" }),
      });
      const sendData: { error?: string } = await sendRes
        .json()
        .catch(() => ({}));
      if (!sendRes.ok) {
        throw new Error(sendData?.error || `send http ${sendRes.status}`);
      }
      setDebug("auto-cap · sent");
      setCapture(null);
      setFeedback("");
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setError(msg);
      setDebug(`auto-cap · err · ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (stage !== "running" || !capture) {
      capStopFiredRef.current = null;
      return;
    }
    if (!sessionCap) return;
    if (
      elapsedMs >= sessionCap.thresholdMs &&
      capStopFiredRef.current !== capture.startedAt &&
      !busy
    ) {
      capStopFiredRef.current = capture.startedAt;
      handleAutoCap();
    }
    // handleAutoCap identity changes each render but its behaviour is invariant;
    // we intentionally exclude it from deps to avoid re-firing on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, capture, sessionCap, elapsedMs, busy]);

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
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Activity selector — 3 inline tiles + ⋯ overflow (opens sheet) */}
      <div className="flex border-b-2 border-ink">
        {strip.map((a) => {
          const sel = a.id === activeId;
          const disabled = selectorLocked || !a.enabled;
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
                borderRight: "2px solid var(--color-ink)",
                touchAction: "manipulation",
              }}
            >
              {a.label}
            </ReliableButton>
          );
        })}
        <ReliableButton
          type="button"
          disabled={selectorLocked}
          onPress={openSheet}
          aria-label="All activities"
          className="w-[54px] shrink-0 px-[6px] py-[14px] text-[16px] font-bold tracking-[2px] disabled:cursor-default"
          style={{
            background: "var(--color-bg)",
            color: "var(--color-ink)",
            touchAction: "manipulation",
          }}
        >
          ⋯
        </ReliableButton>
      </div>

      {/* Hero timer */}
      <div className="flex-1 px-[18px] pt-[34px] pb-2">
        <div className="text-[9px] font-bold tracking-[2.4px] mb-1.5">
          {stage === "idle" && "○ READY — TAP TO START"}
          {stage === "running" && "● RECORDING"}
          {stage === "finished" &&
            (willCap ? `■ CAPPED — ${cappedMinutes} MIN` : "■ COMPLETE — REVIEW")}
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
        {stage === "finished" && (
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="how did it go? (optional)"
            rows={2}
            maxLength={4000}
            disabled={busy}
            className="w-full mb-4 p-3 text-[16px] font-medium border-2 border-ink resize-none focus:outline-none placeholder:text-dim disabled:opacity-60"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              caretColor: accent,
              letterSpacing: "0.3px",
              boxShadow: `4px 4px 0 var(--color-ink)`,
            }}
          />
        )}
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

      {sheetPhase !== "closed" && (
        <ActivitySheet
          activities={ACTIVITIES}
          activeId={activeId}
          shown={sheetPhase === "open"}
          onPick={(id) => {
            setActiveId(id);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

function ShapeMarker({
  shape,
  fill,
  borderColor,
  size = 16,
}: {
  shape: Shape;
  fill: string;
  borderColor: string;
  size?: number;
}) {
  if (shape === "triangle") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        style={{ overflow: "visible", flexShrink: 0 }}
        aria-hidden="true"
      >
        <polygon
          points="7,1 13,12 1,12"
          fill={fill}
          stroke={borderColor}
          strokeWidth={2}
          strokeLinejoin="miter"
        />
      </svg>
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: fill,
        border: `2px solid ${borderColor}`,
        transform: shape === "diamond" ? "rotate(45deg)" : "none",
        borderRadius: shape === "circle" ? "50%" : 0,
        flexShrink: 0,
      }}
    />
  );
}

function ActivitySheet({
  activities,
  activeId,
  shown,
  onPick,
  onClose,
}: {
  activities: readonly Activity[];
  activeId: ActivityId;
  shown: boolean;
  onPick: (id: ActivityId) => void;
  onClose: () => void;
}) {
  const spanFull = activities.length % 2 === 0;
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{
        background: "rgba(10, 10, 10, 0.32)",
        opacity: shown ? 1 : 0,
        transition: "opacity 150ms ease-out",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-t-2 border-ink"
        style={{
          background: "var(--color-bg)",
          boxShadow: "0 -6px 0 var(--color-ink)",
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: "transform 200ms ease-out",
          paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Sheet header */}
        <div
          className="flex items-center justify-between border-b-2 border-ink"
          style={{ padding: "14px 18px 10px" }}
        >
          <div className="text-[9px] font-bold tracking-[2.4px] text-dim">
            ▸ ALL ACTIVITIES · {activities.length}
          </div>
          <ReliableButton
            type="button"
            onPress={onClose}
            className="border-2 border-ink text-[10px] font-bold tracking-[1.5px]"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              padding: "4px 10px",
              touchAction: "manipulation",
            }}
          >
            CLOSE
          </ReliableButton>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2">
          {activities.map((a, i) => {
            const sel = a.id === activeId;
            const inRightCol = i % 2 === 1;
            return (
              <ReliableButton
                key={a.id}
                type="button"
                onPress={() => onPick(a.id as ActivityId)}
                className="relative flex items-center gap-3 text-left text-[13px] font-bold uppercase tracking-[1px]"
                style={{
                  padding: "16px 18px",
                  borderRight: inRightCol ? "none" : "2px solid var(--color-ink)",
                  borderBottom: "2px solid var(--color-ink)",
                  background: sel ? "var(--color-ink)" : "var(--color-bg)",
                  color: sel ? "var(--color-bg)" : "var(--color-ink)",
                  touchAction: "manipulation",
                }}
              >
                {sel && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[5px]"
                    style={{ background: a.accent }}
                  />
                )}
                <ShapeMarker
                  shape={a.shape}
                  fill={a.accent}
                  borderColor={sel ? "var(--color-bg)" : "var(--color-ink)"}
                  size={16}
                />
                <span className="flex-1">{a.label.toUpperCase()}</span>
              </ReliableButton>
            );
          })}
          {/* + NEW ACTIVITY (future) */}
          <div
            className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[1.5px]"
            style={{
              padding: "16px 18px",
              borderRight: spanFull ? "none" : "2px solid var(--color-ink)",
              borderBottom: "2px solid var(--color-ink)",
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              gridColumn: spanFull ? "1 / -1" : "auto",
              opacity: 0.45,
            }}
          >
            <div
              aria-hidden="true"
              className="flex items-center justify-center text-[12px] font-bold"
              style={{
                width: 16,
                height: 16,
                border: "2px dashed var(--color-ink)",
              }}
            >
              +
            </div>
            <span className="flex-1">NEW ACTIVITY</span>
          </div>
        </div>

        {/* Hint footer */}
        <div
          className="text-[9px] font-bold tracking-[2px] text-dim"
          style={{ padding: "12px 18px 4px" }}
        >
          LONG-PRESS ANY TILE TO EDIT · REORDER
        </div>
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
