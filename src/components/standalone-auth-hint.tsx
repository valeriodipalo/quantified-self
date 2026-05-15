"use client";

import { useEffect, useState } from "react";

type IOSNavigator = Navigator & { standalone?: boolean };

export function StandaloneAuthHint() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const displayModeStandalone =
      typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches === true;
    const iosStandalone =
      typeof navigator !== "undefined" &&
      (navigator as IOSNavigator).standalone === true;
    setIsStandalone(displayModeStandalone || iosStandalone);
  }, []);

  if (!isStandalone) return null;

  return (
    <div
      className="border-2 border-ink px-4 py-3 text-[10px] font-bold uppercase leading-relaxed tracking-[1.5px] text-ink max-w-[300px]"
      style={{ background: "var(--color-bg)", boxShadow: "4px 4px 0 var(--color-ink)" }}
    >
      <div className="text-dim mb-1">▸ iOS NOTE</div>
      Sign-in opens Safari. Complete there, then switch back here — this screen refreshes automatically.
    </div>
  );
}
