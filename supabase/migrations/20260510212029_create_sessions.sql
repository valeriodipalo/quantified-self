-- Sessions: one row per committed (SEND'd) activity session.
-- Discarded sessions never land here. Schema is deliberately permissive:
-- `activity` is free text (no enum) so adding new activity types needs no migration,
-- and `metadata` jsonb absorbs activity-specific fields.

create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  activity            text not null,
  started_at          timestamptz not null,
  ended_at            timestamptz not null,
  duration_ms         integer not null,
  capped              boolean not null default false,
  feedback            text,
  google_event_id     text,
  google_calendar_id  text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),

  constraint sessions_duration_nonneg check (duration_ms >= 0),
  constraint sessions_time_order      check (ended_at >= started_at)
);

create index sessions_started_at_idx on public.sessions (started_at desc);
create index sessions_activity_idx   on public.sessions (activity);

-- RLS on, no policies: service-role server writes only. Anon/authenticated
-- clients cannot read or write. Add policies later if a multi-user layer
-- ever lands.
alter table public.sessions enable row level security;
