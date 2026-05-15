"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// iOS quirk: when the user signs in via Safari and switches back to the PWA,
// the cookie is now in the shared cookie store (iOS 16.4+), but the PWA's
// in-memory view still shows the stale signed-out HTML — often restored from
// bfcache. We force a re-fetch on bfcache restore and on visibility-return
// so the server re-runs with the freshly visible cookie.
export function AuthRefreshOnReturn() {
  const router = useRouter();

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

export function RefreshAuthButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="text-[10px] font-bold uppercase tracking-[1.8px] text-dim disabled:opacity-50"
      style={{ touchAction: "manipulation" }}
    >
      {pending ? "▸ CHECKING…" : "↻ ALREADY SIGNED IN?"}
    </button>
  );
}
