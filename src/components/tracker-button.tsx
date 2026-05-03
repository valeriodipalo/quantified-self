"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  signedIn: boolean;
  activeSessionStart: number | null;
}

export function TrackerButton({ signedIn, activeSessionStart }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<number | null>(activeSessionStart);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!signedIn) {
    return (
      <a
        href="/api/auth/google"
        className="flex h-14 min-w-[16rem] items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-opacity hover:opacity-90"
      >
        Sign in with Google
      </a>
    );
  }

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed to start");
      setActive(data.start);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed to stop");
      setActive(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            Reading
          </span>
          <span className="font-mono text-5xl tabular-nums">
            {formatElapsed(now - active)}
          </span>
        </div>
        <button
          onClick={handleStop}
          disabled={busy}
          className="flex h-14 min-w-[16rem] items-center justify-center rounded-full bg-red-600 px-8 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Stop"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleStart}
        disabled={busy}
        className="flex h-14 min-w-[16rem] items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start Reading"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
