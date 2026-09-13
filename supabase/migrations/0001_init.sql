-- Study Planner — Phase 2 schema.
--
-- Two columns exist here that are not in the spec's §3 model, because
-- cloud storage cannot work without them:
--   user_id     — row ownership, so row-level security can isolate the account.
--   updated_at  — the comparison for last-write-wins (Phase 2's stated conflict rule).
-- Neither represents a time of day for planned work; §3's constraint is intact.
--
-- The cumulative placement invariant and the Monday/first-of-month rules are
-- enforced here as CHECK constraints as well as in the client, so a bad write
-- from any source is rejected rather than stored.

create extension if not exists pgcrypto;

-- ── Deadlines ───────────────────────────────────────────────────────────────

create table if not exists public.deadlines (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  title             text not null,
  date              date not null,
  kind              text not null check (kind in ('exam', 'application', 'submission', 'other')),
  notes             text,
  source            text not null default 'manual' check (source in ('manual', 'calendar')),
  calendar_event_id text,
  archived_at       timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists deadlines_user_date_idx on public.deadlines (user_id, date);
create unique index if not exists deadlines_user_event_idx
  on public.deadlines (user_id, calendar_event_id)
  where calendar_event_id is not null;

-- ── Milestones ──────────────────────────────────────────────────────────────

create table if not exists public.milestones (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  deadline_id uuid not null references public.deadlines (id) on delete cascade,
  title       text not null,
  "order"     integer not null default 0,
  archived_at timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists milestones_user_deadline_idx on public.milestones (user_id, deadline_id);

-- ── Tasks ───────────────────────────────────────────────────────────────────

create table if not exists public.tasks (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null,
  deadline_id     uuid references public.deadlines (id) on delete set null,
  milestone_id    uuid references public.milestones (id) on delete set null,
  size            text check (size in ('S', 'M', 'L')),
  placement_level text not null check (placement_level in ('none', 'month', 'week', 'day')),
  placement_month date,
  placement_week  date,
  placement_day   date,
  status          text not null default 'open' check (status in ('open', 'done', 'dropped')),
  carry_count     integer not null default 0 check (carry_count >= 0),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  notes           text,
  updated_at      timestamptz not null default now(),

  -- §3 — placement fields are cumulative.
  constraint placement_cumulative check (
    (placement_level = 'none'
      and placement_month is null and placement_week is null and placement_day is null)
    or (placement_level = 'month'
      and placement_month is not null and placement_week is null and placement_day is null)
    or (placement_level = 'week'
      and placement_month is not null and placement_week is not null and placement_day is null)
    or (placement_level = 'day'
      and placement_month is not null and placement_week is not null and placement_day is not null)
  ),
  -- §3 — weeks start on Monday, months at the first.
  constraint placement_week_is_monday check (
    placement_week is null or extract(isodow from placement_week) = 1
  ),
  constraint placement_month_is_first check (
    placement_month is null or extract(day from placement_month) = 1
  ),
  -- §3 — a week belongs to the month containing its Thursday, so a day's month
  -- is the month of its week's Thursday, never the day's own calendar month.
  constraint placement_month_owns_week check (
    placement_week is null
    or placement_month = date_trunc('month', placement_week + 3)::date
  ),
  constraint placement_day_in_week check (
    placement_day is null
    or (placement_day >= placement_week and placement_day < placement_week + 7)
  )
);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_month_idx on public.tasks (user_id, placement_month);
create index if not exists tasks_user_day_idx on public.tasks (user_id, placement_day);

-- ── Preferences (§9) ────────────────────────────────────────────────────────

create table if not exists public.preferences (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  day_close  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Calendar (§7) ───────────────────────────────────────────────────────────

-- The Google refresh token, needed to call the Calendar API from the server
-- after the sign-in session has gone. Readable only by its owner; the push
-- webhook reaches it with the service role, since Google's request carries no
-- user session.
create table if not exists public.google_credentials (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.calendar_watches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  calendar_id text not null,
  channel_id  text not null unique,
  resource_id text not null,
  expiration  timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (user_id, calendar_id)
);

-- §7 — "reflect it and tell me what changed rather than updating silently".
create table if not exists public.calendar_changes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  deadline_id uuid,
  title       text not null,
  change      text not null check (change in ('added', 'moved', 'retitled', 'removed')),
  detail      text,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);

create index if not exists calendar_changes_unseen_idx
  on public.calendar_changes (user_id, created_at desc)
  where seen_at is null;

-- ── Row-level security ──────────────────────────────────────────────────────
-- Single-user by design, but the data is private: every row is reachable only
-- by the account that owns it.

alter table public.deadlines          enable row level security;
alter table public.milestones         enable row level security;
alter table public.tasks              enable row level security;
alter table public.preferences        enable row level security;
alter table public.google_credentials enable row level security;
alter table public.calendar_watches   enable row level security;
alter table public.calendar_changes   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'deadlines', 'milestones', 'tasks', 'preferences',
    'google_credentials', 'calendar_watches', 'calendar_changes'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own', t
    );
  end loop;
end
$$;

-- ── Realtime (§2) ───────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.deadlines;
    alter publication supabase_realtime add table public.milestones;
    alter publication supabase_realtime add table public.tasks;
    alter publication supabase_realtime add table public.preferences;
    alter publication supabase_realtime add table public.calendar_changes;
  end if;
exception
  when duplicate_object then null;
end
$$;
