"use client";

import { useEffect, useState } from "react";

export function TopBar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-center justify-between border-b-2 border-ink px-[18px] py-3">
      <span className="text-[10px] font-bold tracking-[2px]">QUANTIFIED.SELF</span>
      <span className="text-[10px] tabular-nums text-dim">
        {now ? formatClock(now) : "—:—:—"}
      </span>
    </header>
  );
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
