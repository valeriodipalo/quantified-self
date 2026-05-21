"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActivityId, CaptureState, CaptureStage } from "@/lib/session";
import { ACTIVITY_CAPS } from "@/lib/activity-caps";
import { ReliableButton } from "@/components/reliable-button";
import type { SmokingPackRow } from "@/lib/supabase";

interface Props {
  initialCapture: CaptureState | null;
  initialSmokingPack: SmokingPackRow | null;
  initialSmokedCount: number;
}

type Shape = "circle" | "square" | "diamond" | "triangle";

const ACTIVITIES = [
  { id: "reading", label: "Reading", accent: "var(--color-reading)", contrast: false, enabled: true, shape: "circle" satisfies Shape },
  { id: "meditation", label: "Meditation", accent: "var(--color-meditation)", contrast: true, enabled: true, shape: "square" satisfies Shape },
  { id: "smoking", label: "Smoking", accent: "var(--color-smoking)", contrast: true, enabled: true, shape: "diamond" satisfies Shape },
  { id: "music", label: "Music", accent: "var(--color-music)", contrast: true, enabled: true, shape: "triangle" satisfies Shape },
] as const;

type Activity = (typeof ACTIVITIES)[number];

type SheetKind = "closed" | "all-activities" | "pack" | "backdate";
type SheetPhase = "closed" | "opening" | "open" | "closing";

const NOTE_MAX_LEN = 4000;

export function Tracker({
  initialCapture,
  initialSmokingPack,
  initialSmokedCount,
}: Props) {
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState | null>(initialCapture);
  const [activeId, setActiveId] = useState<ActivityId>(
    initialCapture?.activity ?? "reading"
  );
  const [startNote, setStartNote] = useState<string>(
    initialCapture?.startNote ?? ""
  );
  const [feedback, setFeedback] = useState("");
  const [pack, setPack] = useState<SmokingPackRow | null>(initialSmokingPack);
  const [smokedCount, setSmokedCount] = useState<number>(initialSmokedCount);
  const [now, setNow] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>("closed");
  const [sheetPhase, setSheetPhase] = useState<SheetPhase>("closed");
  // Snapshot of the pack at the moment FINISH PACK succeeded, so the pack
  // sheet can render a recap view (count + tracked %) after the pack row is
  // already cleared from state. Reset when the sheet closes.
  const [finishedRecap, setFinishedRecap] = useState<{
    smokedCount: number;
    total: number | null;
  } | null>(null);
  const [, startTransition] = useTransition();
  const capStopFiredRef = useRef<number | null>(null);

  useEffect(() => {
    if (sheetPhase === "opening") {
      const r = requestAnimationFrame(() => setSheetPhase("open"));
      return () => cancelAnimationFrame(r);
    }
    if (sheetPhase === "closing") {
      const t = setTimeout(() => {
        setSheetPhase("closed");
        setSheet("closed");
        setFinishedRecap(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [sheetPhase]);

  const openSheet = (kind: Exclude<SheetKind, "closed">) => {
    setError(null);
    setSheet(kind);
    setSheetPhase("opening");
  };
  const closeSheet = () => setSheetPhase("closing");

  const stage: CaptureStage = !capture ? "idle" : capture.endedAt ? "finished" : "running";
  const activity = ACTIVITIES.find((a) => a.id === activeId)!;
  const accent = activity.accent;
  const sessionActivity: ActivityId = capture?.activity ?? activeId;
  const sessionCap = ACTIVITY_CAPS[sessionActivity];
  const isSmoking = activeId === "smoking";

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

  const callApi = async <T extends Record<string, unknown>>(
    label: string,
    path: string,
    method: "POST" | "GET",
    body: Record<string, unknown> | null
  ): Promise<T | null> => {
    setBusy(true);
    setError(null);
    setDebug(`${label} · …`);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        // non-JSON response (e.g. HTML error page) — leave data empty
      }
      if (!res.ok) {
        const msg = (data?.error as string) || `http ${res.status}`;
        setDebug(`${label} · ${res.status} · ${msg}`);
        throw new Error(msg);
      }
      setDebug(`${label} · ${res.status} · ok`);
      return data as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setError(msg);
      setDebug((prev) => prev ?? `${label} · — · ${msg}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const refreshPack = async () => {
    const data = await callApi<{
      pack: SmokingPackRow | null;
      smokedCount: number;
    }>("pack.refresh", "/api/smoking/packs/current", "GET", null);
    if (data) {
      setPack(data.pack);
      setSmokedCount(data.smokedCount);
    }
  };

  const handleStart = async () => {
    const body: Record<string, unknown> = { activity: activeId };
    const trimmed = startNote.trim();
    if (trimmed) body.startNote = trimmed;
    const data = await callApi<{ capture: CaptureState }>(
      "start",
      "/api/sessions/start",
      "POST",
      body
    );
    if (data?.capture) setCapture(data.capture);
  };

  const handleStop = async () => {
    const data = await callApi<{ capture: CaptureState }>(
      "stop",
      "/api/sessions/stop",
      "POST",
      null
    );
    if (data?.capture) setCapture(data.capture);
  };

  const handleSend = async () => {
    const body: Record<string, unknown> = { feedback: feedback.trim() };
    const trimmedNote = startNote.trim();
    if (trimmedNote) body.startNote = trimmedNote;
    const data = await callApi(
      "send",
      "/api/sessions/send",
      "POST",
      body
    );
    if (data) {
      setCapture(null);
      setStartNote("");
      setFeedback("");
      if (sessionActivity === "smoking") await refreshPack();
      startTransition(() => router.refresh());
    }
  };

  const handleDiscard = async () => {
    const data = await callApi(
      "discard",
      "/api/sessions/discard",
      "POST",
      null
    );
    if (data) {
      setCapture(null);
      setStartNote("");
      setFeedback("");
    }
  };

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
      const body: Record<string, unknown> = { feedback: feedback.trim() };
      const trimmedNote = startNote.trim();
      if (trimmedNote) body.startNote = trimmedNote;
      const sendRes = await fetch("/api/sessions/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const sendData: { error?: string } = await sendRes
        .json()
        .catch(() => ({}));
      if (!sendRes.ok) {
        throw new Error(sendData?.error || `send http ${sendRes.status}`);
      }
      setDebug("auto-cap · sent");
      setCapture(null);
      setStartNote("");
      setFeedback("");
      if (sessionActivity === "smoking") await refreshPack();
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
    // intentionally excluded from deps to avoid re-firing on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, capture, sessionCap, elapsedMs, busy]);

  // ─── pack actions ────────────────────────────────────────────────────────

  const handleOpenPack = async (note: string, cigaretteCount: number | null) => {
    const body: Record<string, unknown> = {};
    if (note.trim()) body.note = note.trim();
    if (cigaretteCount != null) body.cigaretteCount = cigaretteCount;
    const data = await callApi<{ pack: SmokingPackRow }>(
      "pack.open",
      "/api/smoking/packs/start",
      "POST",
      body
    );
    if (data?.pack) {
      setPack(data.pack);
      setSmokedCount(0);
      closeSheet();
    }
  };

  const handleFinishPack = async () => {
    // Snapshot before mutation — recap needs these even after pack is null.
    const recapSnapshot = {
      smokedCount,
      total: pack?.cigarette_count ?? null,
    };
    const data = await callApi<{ pack: SmokingPackRow }>(
      "pack.finish",
      "/api/smoking/packs/finish",
      "POST",
      null
    );
    if (data?.pack) {
      setPack(null);
      setSmokedCount(0);
      setFinishedRecap(recapSnapshot);
      // Keep sheet open so the recap view paints; user dismisses via CLOSE.
    }
  };

  const handleLogPast = async (input: {
    startedAt: string;
    endedAt: string;
    startNote: string;
    feedback: string;
  }) => {
    const data = await callApi("log", "/api/sessions/log", "POST", {
      activity: activeId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      startNote: input.startNote.trim() || undefined,
      feedback: input.feedback.trim() || undefined,
    });
    if (data) {
      if (activeId === "smoking") await refreshPack();
      closeSheet();
      startTransition(() => router.refresh());
    }
  };

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
          onPress={() => openSheet("all-activities")}
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

      {/* Smoking sub-strip: small log-past link (left) + pack chip (right) */}
      {isSmoking && (
        <div
          className="flex items-center justify-between border-b-2 border-ink"
          style={{ padding: "8px 18px" }}
        >
          <ReliableButton
            type="button"
            onPress={() => openSheet("backdate")}
            disabled={busy}
            className="text-[10px] font-bold uppercase tracking-[1.5px] disabled:opacity-50"
            style={{
              color: "var(--color-ink)",
              touchAction: "manipulation",
            }}
          >
            ⌗ LOG PAST
          </ReliableButton>
          <PackChip
            pack={pack}
            smokedCount={smokedCount}
            busy={busy}
            onTap={() => openSheet("pack")}
          />
        </div>
      )}

      {/* Hero timer */}
      <div className="flex-1 px-[18px] pt-[26px] pb-2">
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

      {/* Notes + action button */}
      <div className="px-[18px] pt-5 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        {/* Start-note textarea: available during idle and running */}
        {stage !== "finished" && (
          <textarea
            value={startNote}
            onChange={(e) => setStartNote(e.target.value)}
            placeholder={
              stage === "idle"
                ? "note before you start (optional)"
                : "edit note while recording (optional)"
            }
            rows={2}
            maxLength={NOTE_MAX_LEN}
            disabled={busy}
            className="w-full mb-4 p-3 text-[15px] font-medium border-2 border-ink resize-none focus:outline-none placeholder:text-dim disabled:opacity-60"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              caretColor: accent,
              letterSpacing: "0.3px",
              boxShadow: `4px 4px 0 var(--color-ink)`,
            }}
          />
        )}

        {/* Reflection textarea: at finished stage */}
        {stage === "finished" && (
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="how did it go? (optional)"
            rows={2}
            maxLength={NOTE_MAX_LEN}
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

      {sheetPhase !== "closed" && sheet === "all-activities" && (
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
      {sheetPhase !== "closed" && sheet === "pack" && (
        <PackSheet
          shown={sheetPhase === "open"}
          pack={pack}
          smokedCount={smokedCount}
          finishedRecap={finishedRecap}
          busy={busy}
          onOpenPack={handleOpenPack}
          onFinishPack={handleFinishPack}
          onClose={closeSheet}
        />
      )}
      {sheetPhase !== "closed" && sheet === "backdate" && (
        <BackdateSheet
          shown={sheetPhase === "open"}
          accent={accent}
          contrast={activity.contrast}
          busy={busy}
          onSubmit={handleLogPast}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

// ─── pack chip (small button, top right of smoking sub-strip) ──────────────

function PackChip({
  pack,
  smokedCount,
  busy,
  onTap,
}: {
  pack: SmokingPackRow | null;
  smokedCount: number;
  busy: boolean;
  onTap: () => void;
}) {
  const isOpen = !!pack;
  const total = pack?.cigarette_count ?? null;
  const trackedPct =
    total != null && total > 0 ? Math.round((smokedCount / total) * 100) : null;
  const label = isOpen
    ? trackedPct != null
      ? `${smokedCount}/${total} · ${trackedPct}%`
      : `${smokedCount} PACK`
    : "+ OPEN PACK";

  return (
    <ReliableButton
      type="button"
      onPress={onTap}
      disabled={busy}
      aria-label={isOpen ? "View pack" : "Open new pack"}
      className="flex items-center gap-1.5 border-2 border-ink text-[10px] font-bold tracking-[1.5px] tabular-nums disabled:opacity-50"
      style={{
        background: isOpen ? "var(--color-ink)" : "var(--color-bg)",
        color: isOpen ? "var(--color-smoking)" : "var(--color-ink)",
        padding: "5px 9px",
        boxShadow: `2px 2px 0 var(--color-ink)`,
        touchAction: "manipulation",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          background: isOpen ? "var(--color-smoking)" : "transparent",
          border: `1.5px solid ${
            isOpen ? "var(--color-smoking)" : "var(--color-ink)"
          }`,
          transform: "rotate(45deg)",
          display: "inline-block",
        }}
      />
      {label}
    </ReliableButton>
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
    <SheetShell title={`ALL ACTIVITIES · ${activities.length}`} shown={shown} onClose={onClose}>
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
      <div
        className="text-[9px] font-bold tracking-[2px] text-dim"
        style={{ padding: "12px 18px 4px" }}
      >
        LONG-PRESS ANY TILE TO EDIT · REORDER
      </div>
    </SheetShell>
  );
}

// ─── pack sheet ─────────────────────────────────────────────────────────────

function PackSheet({
  shown,
  pack,
  smokedCount,
  finishedRecap,
  busy,
  onOpenPack,
  onFinishPack,
  onClose,
}: {
  shown: boolean;
  pack: SmokingPackRow | null;
  smokedCount: number;
  finishedRecap: { smokedCount: number; total: number | null } | null;
  busy: boolean;
  onOpenPack: (note: string, cigaretteCount: number | null) => void;
  onFinishPack: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [countText, setCountText] = useState("20");

  const submitNew = () => {
    const parsed = parseInt(countText, 10);
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    onOpenPack(note, count);
  };

  if (finishedRecap) {
    const { smokedCount: smoked, total } = finishedRecap;
    const pct =
      total != null && total > 0 ? Math.round((smoked / total) * 100) : null;
    return (
      <SheetShell title="PACK FINISHED" shown={shown} onClose={onClose}>
        <div className="px-[18px] py-6 flex flex-col items-center gap-5">
          {pct != null ? (
            <>
              <span
                className="text-[64px] font-bold tabular-nums leading-none"
                style={{
                  color: "var(--color-smoking)",
                  letterSpacing: "-3px",
                  textShadow: "3px 3px 0 var(--color-ink)",
                }}
              >
                {pct}%
              </span>
              <span className="text-[10px] font-bold tracking-[2.4px] text-dim">
                TRACKED
              </span>
              <span className="text-[18px] font-bold tabular-nums tracking-[1px]">
                {smoked} / {total} SMOKED
              </span>
            </>
          ) : (
            <>
              <span
                className="text-[64px] font-bold tabular-nums leading-none"
                style={{
                  color: "var(--color-smoking)",
                  letterSpacing: "-3px",
                  textShadow: "3px 3px 0 var(--color-ink)",
                }}
              >
                {smoked}
              </span>
              <span className="text-[10px] font-bold tracking-[2.4px] text-dim">
                TRACKED
              </span>
            </>
          )}
          <ReliableButton
            type="button"
            onPress={onClose}
            disabled={busy}
            className="h-[60px] w-full text-[16px] font-bold uppercase tracking-[3px] border-2 border-ink disabled:opacity-60"
            style={{
              background: "var(--color-ink)",
              color: "var(--color-bg)",
              boxShadow: `4px 4px 0 var(--color-smoking)`,
              touchAction: "manipulation",
            }}
          >
            CLOSE
          </ReliableButton>
        </div>
      </SheetShell>
    );
  }

  if (pack) {
    const opened = new Date(pack.started_at);
    const ageMs = Date.now() - opened.getTime();
    const total = pack.cigarette_count;
    return (
      <SheetShell title="CURRENT PACK" shown={shown} onClose={onClose}>
        <div className="px-[18px] py-4 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[40px] font-bold tabular-nums leading-none"
                style={{ letterSpacing: "-1.5px" }}
              >
                {smokedCount}
              </span>
              {total != null && (
                <span className="text-[14px] font-bold tabular-nums tracking-[1px] text-dim">
                  / {total}
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-dim ml-1">
                smoked
              </span>
            </div>
            <span className="text-[10px] font-bold tracking-[1.5px] text-dim tabular-nums">
              OPENED {formatElapsed(ageMs)} AGO
            </span>
          </div>
          {pack.note && (
            <div className="text-[12px] tracking-[0.5px] text-dim">
              ▸ {pack.note}
            </div>
          )}
          <ReliableButton
            type="button"
            onPress={onFinishPack}
            disabled={busy}
            className="h-[60px] text-[16px] font-bold uppercase tracking-[3px] border-2 border-ink disabled:opacity-60"
            style={{
              background: "var(--color-ink)",
              color: "var(--color-bg)",
              boxShadow: `4px 4px 0 var(--color-smoking)`,
              touchAction: "manipulation",
            }}
          >
            {busy ? "…" : "FINISH PACK"}
          </ReliableButton>
          <span className="text-[9px] tabular-nums tracking-[1.5px] text-dim">
            ID {pack.id.slice(0, 8)}
          </span>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title="OPEN NEW PACK" shown={shown} onClose={onClose}>
      <div className="px-[18px] py-4 flex flex-col gap-4">
        <Field label="BRAND / NOTE (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX_LEN}
            placeholder="e.g. Marlboro Red"
            className="w-full p-3 text-[15px] font-medium border-2 border-ink focus:outline-none placeholder:text-dim"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        <Field label="CIGARETTES IN PACK">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            className="w-full p-3 text-[15px] font-bold tabular-nums border-2 border-ink focus:outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        <ReliableButton
          type="button"
          onPress={submitNew}
          disabled={busy}
          className="h-[64px] text-[18px] font-bold uppercase tracking-[4px] border-2 border-ink disabled:opacity-60"
          style={{
            background: "var(--color-smoking)",
            color: "var(--color-bg)",
            boxShadow: `5px 5px 0 var(--color-reading)`,
            touchAction: "manipulation",
          }}
        >
          {busy ? "…" : "OPEN PACK"}
        </ReliableButton>
      </div>
    </SheetShell>
  );
}

// ─── backdate sheet ─────────────────────────────────────────────────────────

function BackdateSheet({
  shown,
  accent,
  contrast,
  busy,
  onSubmit,
  onClose,
}: {
  shown: boolean;
  accent: string;
  contrast: boolean;
  busy: boolean;
  onSubmit: (input: {
    startedAt: string;
    endedAt: string;
    startNote: string;
    feedback: string;
  }) => void;
  onClose: () => void;
}) {
  const [defaults] = useState(() => {
    const nowMs = Date.now();
    const endMs = nowMs - (nowMs % 60_000);
    const startMs = endMs - 6 * 60_000;
    return { startInput: toLocalInput(startMs), endInput: toLocalInput(endMs) };
  });
  const [startInput, setStartInput] = useState(defaults.startInput);
  const [endInput, setEndInput] = useState(defaults.endInput);
  const [note, setNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const startMs = fromLocalInput(startInput);
    const endMs = fromLocalInput(endInput);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setLocalError("invalid date/time");
      return;
    }
    if (endMs <= startMs) {
      setLocalError("end must be after start");
      return;
    }
    if (endMs > Date.now() + 60_000) {
      setLocalError("end cannot be in the future");
      return;
    }
    setLocalError(null);
    onSubmit({
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      startNote: note,
      feedback: reflection,
    });
  };

  const durMs = fromLocalInput(endInput) - fromLocalInput(startInput);
  const durMin = Number.isFinite(durMs) && durMs > 0 ? Math.round(durMs / 60_000) : null;
  const saveFg = contrast ? "var(--color-bg)" : "var(--color-ink)";
  const saveShadow = contrast ? "var(--color-reading)" : "var(--color-ink)";

  return (
    <SheetShell title="LOG PAST SESSION" shown={shown} onClose={onClose}>
      <div className="px-[18px] py-4 flex flex-col gap-4">
        <Field label="START">
          <input
            type="datetime-local"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            className="w-full p-3 text-[15px] font-bold tabular-nums border-2 border-ink focus:outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        <Field label="END">
          <input
            type="datetime-local"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            className="w-full p-3 text-[15px] font-bold tabular-nums border-2 border-ink focus:outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        <div className="text-[10px] font-bold tracking-[2px] text-dim tabular-nums">
          {durMin != null ? `▸ ${durMin} MIN` : "▸ — MIN"}
        </div>
        <Field label="NOTE AT START (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX_LEN}
            placeholder="context, why, where"
            className="w-full p-3 text-[15px] font-medium border-2 border-ink focus:outline-none placeholder:text-dim"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        <Field label="REFLECTION (optional)">
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={2}
            maxLength={NOTE_MAX_LEN}
            placeholder="how did it feel?"
            className="w-full p-3 text-[15px] font-medium border-2 border-ink resize-none focus:outline-none placeholder:text-dim"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          />
        </Field>
        {localError && (
          <p className="text-[11px] tracking-[1px] text-reading">! {localError}</p>
        )}
        <ReliableButton
          type="button"
          onPress={submit}
          disabled={busy}
          className="h-[64px] text-[18px] font-bold uppercase tracking-[4px] border-2 border-ink disabled:opacity-60"
          style={{
            background: accent,
            color: saveFg,
            boxShadow: `5px 5px 0 ${saveShadow}`,
            touchAction: "manipulation",
          }}
        >
          {busy ? "…" : "SAVE"}
        </ReliableButton>
      </div>
    </SheetShell>
  );
}

// ─── sheet shell ────────────────────────────────────────────────────────────

function SheetShell({
  shown,
  title,
  onClose,
  children,
}: {
  shown: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          className="flex items-center justify-between border-b-2 border-ink"
          style={{ padding: "14px 18px 10px" }}
        >
          <div className="text-[9px] font-bold tracking-[2.4px] text-dim">
            ▸ {title}
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
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold tracking-[2px] text-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── timer + buttons ────────────────────────────────────────────────────────

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

// ─── helpers ────────────────────────────────────────────────────────────────

function formatClockShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}
