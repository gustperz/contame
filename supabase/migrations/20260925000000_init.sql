-- Contame: each user's data, synced from the phone and writable by other sources
-- (bank notices, shortcuts, an AI model).
--
-- Conventions shared by every table:
--   * (user_id, id) is the primary key. Ids are generated on the device, so a row
--     can be created offline and uploaded later without renumbering.
--   * updated_at is always set by the server. It is the cursor the phone uses to
--     ask "what changed since the last time", so it cannot trust device clocks.
--   * Rows are soft-deleted with deleted_at, so a deletion made on one device
--     reaches the others instead of the row silently coming back.
--   * Row level security: a user only ever sees and writes their own rows.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create table public.accounts (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id           text        not null,
  name         text        not null,
  emoji        text        not null default '💳',
  aliases      text[]      not null default '{}',
  credit       boolean     not null default false,
  initial_debt numeric(14, 2) not null default 0 check (initial_debt >= 0),
  position     integer     not null default 0,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.expenses (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id           text        not null,
  amount       numeric(14, 2) not null check (amount > 0),
  category     text        not null,
  account_id   text,
  description  text        not null,
  date         date        not null,
  created_at   timestamptz not null,
  source       text,
  installments integer     check (installments is null or installments > 1),
  -- Where the expense came from: typed in the app, or confirmed from the inbox.
  origin       text        not null default 'app' check (origin in ('app', 'bank', 'ai', 'shortcut')),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.payments (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id           text        not null,
  amount       numeric(14, 2) not null check (amount > 0),
  to_account   text        not null,
  from_account text,
  date         date        not null,
  created_at   timestamptz not null,
  source       text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

-- The chat log: what was typed, and which expenses or payment it produced.
create table public.messages (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id           text        not null,
  text         text        not null,
  kind         text        not null check (kind in ('expense', 'payment', 'plain', 'query', 'undo', 'help')),
  created_at   timestamptz not null,
  expense_ids  text[],
  payment_id   text,
  note         text,
  date         date,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.settings (
  user_id         uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  currency        text        not null default 'COP',
  default_account text,
  updated_at      timestamptz not null default now()
);

-- Purchases captured automatically and waiting for confirmation. The id is the
-- matching key (card, amount, purchase time), so two notices of one purchase
-- land on the same row.
create table public.inbox_items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  amount     numeric(14, 2) not null check (amount > 0),
  merchant   text        not null,
  last4      text,
  date       date        not null,
  time       text        not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  credit     boolean     not null default false,
  source     text        not null check (source in ('bank', 'ai', 'shortcut')),
  notices    jsonb       not null default '[]'::jsonb,
  status     text        not null default 'pending' check (status in ('pending', 'saved', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index accounts_changes    on public.accounts    (user_id, updated_at);
create index expenses_changes    on public.expenses    (user_id, updated_at);
create index payments_changes    on public.payments    (user_id, updated_at);
create index messages_changes    on public.messages    (user_id, updated_at);
create index inbox_items_changes on public.inbox_items (user_id, updated_at);
create index inbox_items_pending on public.inbox_items (user_id) where status = 'pending';

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'expenses', 'payments', 'messages', 'settings', 'inbox_items'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;
