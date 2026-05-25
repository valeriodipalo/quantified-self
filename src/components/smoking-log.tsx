"use client";

import { useEffect, useState } from "react";
import { ReliableButton } from "@/components/reliable-button";

interface DayCount {
  date: string;
  count: number;
}
interface SessionItem {
  id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  backdated: boolean;
  pack_id: string | null;
  start_note: string | null;
  feedback: string | null;
}
interface PackStat {
  id: string;
  started_at: string;
  finished_at: string | null;
  cigarette_count: number | null;
  tracked_count: number;
  note: string | null;
  duration_hours: number | null;
}

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function SmokingLog() {
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [dayCounts, setDayCounts] = useState<DayCount[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [packs, setPacks] = useState<PackStat[]>([]);

  useEffect(() => {
    fetch("/api/smoking/heatmap")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDayCounts(d.days); })
      .catch(() => {});
    fetch("/api/smoking/pack-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPacks(d.packs); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSessions([]);
    fetch(`/api/smoking/sessions?date=${selectedDate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSessions(d.sessions); })
      .catch(() => {});
  }, [selectedDate]);

  return (
    <div className="flex-1 overflow-y-auto">
      <Heatmap
        days={dayCounts}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
      />
      <Timeline
        date={selectedDate}
        sessions={sessions}
        onChangeDate={setSelectedDate}
      />
      <PackHistory packs={packs} />
    </div>
  );
}

// ─── heatmap ───────────────────────────────────────────────────────────────

const WEEKS = 16;
const CELL = 16;
const GAP = 2;
const LABEL_W = 20;

function heatOpacity(count: number): number {
  if (count === 0) return 0.06;
  if (count <= 2) return 0.22;
  if (count <= 5) return 0.42;
  if (count <= 9) return 0.65;
  return 0.9;
}

function Heatmap({
  days,
  selectedDate,
  onSelect,
}: {
  days: DayCount[];
  selectedDate: string;
  onSelect: (d: string) => void;
}) {
  const countMap = new Map(days.map((d) => [d.date, d.count]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const toMon = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(thisMonday.getDate() - toMon);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);

  const cells: Array<{ date: string; count: number } | null> = [];
  const monthMarks: Array<{ col: number; label: string }> = [];
  let prevMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const m = weekStart.getMonth();
    if (m !== prevMonth) {
      monthMarks.push({ col: w, label: MONTHS[m] });
      prevMonth = m;
    }
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start);
      cell.setDate(cell.getDate() + w * 7 + d);
      if (cell > today) {
        cells.push(null);
      } else {
        const ds = toDateStr(cell);
        cells.push({ date: ds, count: countMap.get(ds) ?? 0 });
      }
    }
  }

  return (
    <div className="border-b-2 border-ink" style={{ padding: "14px 18px" }}>
      <div className="text-[9px] font-bold tracking-[2.4px] text-dim mb-3">
        ▸ DAILY HEATMAP
      </div>

      {/* month labels */}
      <div
        style={{
          position: "relative",
          marginLeft: LABEL_W,
          height: 12,
          marginBottom: 4,
        }}
      >
        {monthMarks.map(({ col, label }) => (
          <span
            key={`${col}-${label}`}
            className="text-[8px] font-bold tracking-[1px] text-dim"
            style={{ position: "absolute", left: col * (CELL + GAP) }}
          >
            {label}
          </span>
        ))}
      </div>

      <div style={{ display: "flex" }}>
        {/* day-of-week labels */}
        <div
          style={{
            width: LABEL_W,
            display: "flex",
            flexDirection: "column",
            gap: GAP,
          }}
        >
          {["M", "", "W", "", "F", "", ""].map((l, i) => (
            <div
              key={i}
              style={{
                height: CELL,
                display: "flex",
                alignItems: "center",
              }}
            >
              <span className="text-[8px] font-bold tracking-[1px] text-dim">
                {l}
              </span>
            </div>
          ))}
        </div>

        {/* grid */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gridAutoFlow: "column",
            gridAutoColumns: `${CELL}px`,
            gap: GAP,
          }}
        >
          {cells.map((cell, i) => {
            const selected = cell?.date === selectedDate;
            return (
              <div
                key={i}
                onClick={cell ? () => onSelect(cell.date) : undefined}
                style={{
                  width: CELL,
                  height: CELL,
                  background: cell
                    ? `rgba(10,10,10,${heatOpacity(cell.count)})`
                    : "transparent",
                  border: selected
                    ? "2px solid var(--color-reading)"
                    : cell
                    ? "1px solid var(--color-hair)"
                    : "none",
                  cursor: cell ? "pointer" : "default",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 8,
          marginLeft: LABEL_W,
        }}
      >
        <span className="text-[8px] font-bold tracking-[1px] text-dim">
          LESS
        </span>
        {[0.06, 0.22, 0.42, 0.65, 0.9].map((op) => (
          <div
            key={op}
            style={{
              width: 10,
              height: 10,
              background: `rgba(10,10,10,${op})`,
              border: "1px solid var(--color-hair)",
            }}
          />
        ))}
        <span className="text-[8px] font-bold tracking-[1px] text-dim">
          MORE
        </span>
      </div>
    </div>
  );
}

// ─── timeline ──────────────────────────────────────────────────────────────

function Timeline({
  date,
  sessions,
  onChangeDate,
}: {
  date: string;
  sessions: SessionItem[];
  onChangeDate: (d: string) => void;
}) {
  const shiftDay = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    onChangeDate(toDateStr(d));
  };

  const d = new Date(date + "T12:00:00");
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const isToday = date === toDateStr(new Date());

  return (
    <div className="border-b-2 border-ink" style={{ padding: "14px 18px" }}>
      <div className="text-[9px] font-bold tracking-[2.4px] text-dim mb-3">
        ▸ SESSIONS
      </div>

      {/* date nav */}
      <div className="flex items-center justify-between mb-3">
        <ReliableButton
          type="button"
          onPress={() => shiftDay(-1)}
          className="w-[36px] h-[36px] flex items-center justify-center border-2 border-ink text-[14px] font-bold"
          style={{
            background: "var(--color-bg)",
            color: "var(--color-ink)",
            touchAction: "manipulation",
          }}
        >
          ‹
        </ReliableButton>
        <ReliableButton
          type="button"
          onPress={() => onChangeDate(toDateStr(new Date()))}
          className="text-[12px] font-bold tracking-[2px] tabular-nums"
          style={{
            color: isToday ? "var(--color-reading)" : "var(--color-ink)",
            touchAction: "manipulation",
          }}
        >
          {label}
        </ReliableButton>
        <ReliableButton
          type="button"
          onPress={() => shiftDay(1)}
          disabled={isToday}
          className="w-[36px] h-[36px] flex items-center justify-center border-2 border-ink text-[14px] font-bold disabled:opacity-30"
          style={{
            background: "var(--color-bg)",
            color: "var(--color-ink)",
            touchAction: "manipulation",
          }}
        >
          ›
        </ReliableButton>
      </div>

      {sessions.length === 0 ? (
        <div className="text-[10px] font-bold tracking-[2px] text-dim text-center py-4">
          NO SESSIONS
        </div>
      ) : (
        <div className="flex flex-col gap-[2px]">
          {sessions.map((s) => {
            const t = new Date(s.started_at);
            const mins = Math.round(s.duration_ms / 60_000);
            const note = s.start_note || s.feedback || null;
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 border-2 border-ink"
                style={{
                  padding: "8px 10px",
                  background: "var(--color-bg)",
                }}
              >
                <span className="text-[14px] font-bold tabular-nums" style={{ letterSpacing: "-0.5px" }}>
                  {pad2(t.getHours())}:{pad2(t.getMinutes())}
                </span>
                <span
                  className="text-[10px] font-bold tracking-[1px] tabular-nums"
                  style={{
                    background: "var(--color-ink)",
                    color: "var(--color-bg)",
                    padding: "2px 6px",
                  }}
                >
                  {mins}M
                </span>
                {s.backdated && (
                  <span className="text-[8px] font-bold tracking-[1px] text-dim">
                    PAST
                  </span>
                )}
                {note && (
                  <span
                    className="text-[10px] text-dim truncate flex-1"
                    style={{ minWidth: 0 }}
                  >
                    {note}
                  </span>
                )}
              </div>
            );
          })}
          <div className="text-[9px] font-bold tracking-[2px] text-dim text-center mt-1">
            {sessions.length} SESSION{sessions.length !== 1 ? "S" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── pack history ──────────────────────────────────────────────────────────

function PackHistory({ packs }: { packs: PackStat[] }) {
  if (packs.length === 0) {
    return (
      <div style={{ padding: "14px 18px" }}>
        <div className="text-[9px] font-bold tracking-[2.4px] text-dim mb-3">
          ▸ PACK HISTORY
        </div>
        <div className="text-[10px] font-bold tracking-[2px] text-dim text-center py-4">
          NO PACKS YET
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 18px" }}>
      <div className="text-[9px] font-bold tracking-[2.4px] text-dim mb-3">
        ▸ PACK HISTORY
      </div>
      <div className="flex flex-col gap-3">
        {packs.map((p) => {
          const isOpen = !p.finished_at;
          const startD = new Date(p.started_at);
          const endD = p.finished_at ? new Date(p.finished_at) : null;
          const startLabel = `${startD.getDate()} ${MONTHS[startD.getMonth()]}`;
          const endLabel = endD
            ? `${endD.getDate()} ${MONTHS[endD.getMonth()]}`
            : "NOW";
          const pct =
            p.cigarette_count != null && p.cigarette_count > 0
              ? Math.round((p.tracked_count / p.cigarette_count) * 100)
              : null;
          const durLabel = p.duration_hours != null
            ? p.duration_hours >= 24
              ? `${Math.round(p.duration_hours / 24)}D`
              : `${Math.round(p.duration_hours)}H`
            : null;

          return (
            <div
              key={p.id}
              className="border-2 border-ink"
              style={{
                padding: "10px 12px",
                background: "var(--color-bg)",
                boxShadow: isOpen
                  ? "3px 3px 0 var(--color-reading)"
                  : "3px 3px 0 var(--color-ink)",
              }}
            >
              {/* top row: note + date range */}
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] font-bold tracking-[0.5px] truncate flex-1" style={{ minWidth: 0 }}>
                  {p.note || "PACK"}
                  {isOpen && (
                    <span
                      className="ml-1.5 text-[8px] tracking-[1px]"
                      style={{ color: "var(--color-reading)" }}
                    >
                      OPEN
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-bold tracking-[1px] text-dim tabular-nums ml-2 shrink-0">
                  {startLabel} → {endLabel}
                  {durLabel && ` · ${durLabel}`}
                </span>
              </div>

              {/* bar + counts */}
              <div className="flex items-center gap-2">
                {p.cigarette_count != null && p.cigarette_count > 0 ? (
                  <>
                    <div
                      className="flex-1 h-[8px] border border-ink"
                      style={{ background: "var(--color-hair)" }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (p.tracked_count / p.cigarette_count) * 100)}%`,
                          height: "100%",
                          background: "var(--color-ink)",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums tracking-[0.5px] shrink-0">
                      {p.tracked_count}/{p.cigarette_count}
                    </span>
                    {pct != null && (
                      <span className="text-[10px] font-bold tabular-nums text-dim shrink-0">
                        {pct}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] font-bold tabular-nums tracking-[0.5px]">
                    {p.tracked_count} TRACKED
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
