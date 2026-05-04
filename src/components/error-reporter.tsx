"use client";

import { useEffect, useState } from "react";

export function ErrorReporter() {
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setErrors((prev) => [...prev, `error: ${e.message}`].slice(-3));
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      setErrors((prev) => [...prev, `unhandled: ${msg}`].slice(-3));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 border-b-2 border-ink bg-reading px-3 py-2 text-[10px] font-bold leading-tight tracking-[1px] text-ink"
      onClick={() => setErrors([])}
      style={{ touchAction: "manipulation" }}
    >
      {errors.map((msg, i) => (
        <div key={i} className="break-all">
          ! {msg}
        </div>
      ))}
      <div className="mt-1 opacity-60">[TAP TO DISMISS]</div>
    </div>
  );
}
