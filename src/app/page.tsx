import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, SessionData } from "@/lib/session";
import { TrackerButton } from "@/components/tracker-button";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Quantified Self</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Reading tracker
        </p>
      </div>

      {params.auth_error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Sign-in failed: {params.auth_error}
        </div>
      )}

      <TrackerButton
        signedIn={Boolean(session.refreshToken)}
        activeSessionStart={session.activeSessionStart ?? null}
      />
    </main>
  );
}
