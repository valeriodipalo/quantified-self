-- Smoking resists: one row per "Resisted" tap. Append-only event log of every
-- time the user fought a cigarette urge.
--
-- There is NO stored "real resist" count. A real resist (the user genuinely
-- avoided a cigarette) is DERIVED at read time by combining these taps with
-- smoking sessions: the FIRST tap after a cigarette opens a 1.5h "window"; if
-- no cigarette is logged within 1.5h of that first tap, the window matured into
-- one real resist (max one per between-cigarettes gap). Anchoring on the first
-- tap (not the cigarette) is deliberate — it stops an overnight gap from
-- crediting a "free" resist on waking. See deriveResistWindows() in
-- src/lib/supabase.ts. Everything is recomputable from this log; nothing here
-- is precomputed.

create table public.smoking_resists (
  id          uuid primary key default gen_random_uuid(),
  resisted_at timestamptz not null default now(),
  -- Pack open at tap time, for analytics. ON DELETE SET NULL so deleting a
  -- pack never cascades into the resist log.
  pack_id     uuid references public.smoking_packs(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index smoking_resists_resisted_at_idx
  on public.smoking_resists (resisted_at desc);

-- RLS on, no policies: service-role server writes only. Matches sessions.
alter table public.smoking_resists enable row level security;
