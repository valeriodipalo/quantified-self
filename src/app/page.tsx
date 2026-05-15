import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { TopBar } from "@/components/top-bar";
import { Tracker } from "@/components/tracker";
import { StandaloneAuthHint } from "@/components/standalone-auth-hint";
import {
  AuthRefreshOnReturn,
  RefreshAuthButton,
} from "@/components/auth-refresh-on-return";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const params = await searchParams;
  const signedIn = Boolean(session.refreshToken);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <TopBar />

      {params.auth_error && (
        <div className="border-b-2 border-ink bg-reading px-[18px] py-3 text-[10px] font-bold uppercase tracking-[1.5px] text-ink">
          ! AUTH FAILED — {params.auth_error}
        </div>
      )}

      {signedIn ? (
        <Tracker initialCapture={session.capture ?? null} />
      ) : (
        <SignedOut />
      )}
    </div>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[18px] gap-8">
      <AuthRefreshOnReturn />
      <div className="text-center">
        <div className="text-[9px] font-bold tracking-[2.4px] text-dim">
          ○ AUTH REQUIRED
        </div>
        <div className="mt-2 text-[14px] font-medium tracking-[-0.3px] text-dim max-w-[260px]">
          Authorize Google Calendar to start logging sessions.
        </div>
      </div>
      <StandaloneAuthHint />
      <a
        href="/api/auth/google"
        className="flex h-[84px] w-full items-center justify-center border-2 border-ink bg-reading text-[22px] font-bold uppercase tracking-[5px] text-ink"
        style={{ boxShadow: "6px 6px 0 var(--color-ink)" }}
      >
        SIGN IN
      </a>
      <RefreshAuthButton />
    </div>
  );
}
