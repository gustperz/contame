-- One row per daily review of the person's email (a scheduled Claude Code
-- routine), so the app can show when it last looked and what it found.
-- The routine writes with the database connector; the app only reads.

create table public.inbox_runs (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  id             bigint      generated always as identity primary key,
  ran_at         timestamptz not null default now(),
  -- The day whose email was reviewed (Bogotá calendar).
  day            date        not null,
  emails_seen    integer     not null default 0 check (emails_seen >= 0),
  payments_added integer     not null default 0 check (payments_added >= 0),
  note           text        check (note is null or length(note) <= 500)
);

create index inbox_runs_latest on public.inbox_runs (user_id, ran_at desc);

alter table public.inbox_runs enable row level security;
create policy "own rows" on public.inbox_runs for select to authenticated
  using (user_id = (select auth.uid()));

-- Supabase grants everything on new tables by default; the app only reads.
revoke all on public.inbox_runs from anon, authenticated;
grant select on public.inbox_runs to authenticated;
