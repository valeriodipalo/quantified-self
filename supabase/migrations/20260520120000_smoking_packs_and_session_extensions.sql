-- Smoking packs: a long-running container that groups individual smoking
-- sessions. The user opens a pack, smokes through it over hours/days, then
-- finishes it. Only ONE pack can be open at any time (enforced below).
--
-- A smoking session row may link to the pack that was open at its
-- started_at via sessions.pack_id. Non-smoking activities leave pack_id null.

create table public.smoking_packs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  cigarette_count integer,
  note            text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  constraint smoking_packs_time_order
    check (finished_at is null or finished_at >= started_at),
  constraint smoking_packs_cigarette_count_positive
    check (cigarette_count is null or cigarette_count > 0)
);

create index smoking_packs_started_at_idx
  on public.smoking_packs (started_at desc);

-- Single-open invariant: every open pack indexes the constant expression
-- `(finished_at is null)` → TRUE. The unique constraint then permits only
-- one TRUE value, i.e. at most one open pack at any time.
create unique index smoking_packs_one_open_idx
  on public.smoking_packs ((finished_at is null))
  where finished_at is null;

-- RLS on, no policies: service-role server writes only. Matches sessions.
alter table public.smoking_packs enable row level security;

-- Sessions: extend with fields that came out of the smoking-flow restructure.
--   start_note  — free-text comment captured when the timer started
--                 (intent/context). Distinct from `feedback` which is the
--                 reflection captured at SEND.
--   backdated   — TRUE for rows logged retrospectively via /api/sessions/log
--                 (i.e. the session never ran through the live capture
--                 state machine). Useful for filtering analytics.
--   pack_id     — FK to smoking_packs. Only ever set for smoking sessions.
--                 ON DELETE SET NULL so deleting a pack doesn't cascade-
--                 delete its sessions (sessions are the source of truth).
alter table public.sessions
  add column start_note text,
  add column backdated  boolean not null default false,
  add column pack_id    uuid references public.smoking_packs(id) on delete set null;

create index sessions_pack_id_idx on public.sessions (pack_id);
