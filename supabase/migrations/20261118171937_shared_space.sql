-- Sharing: two people keeping one set of expenses.
--
-- Every synced row already belongs to a person through user_id. A shared
-- "space" is simply one person's rows (the owner's), opened to the people
-- listed in public.members: a member reads and writes the owner's rows instead
-- of their own, so nothing has to be moved or copied.
--
--   * public.members: who belongs to which space, and the name the app shows.
--   * private.invites: emails that become members the moment they sign up.
--     Like the allow list, the emails are data and never part of a migration.
--   * created_by / owner_id: who wrote an expense, payment or chat line, and
--     whose account it is. Null means the owner of the space.
--   * settings.member_defaults: each member's own default account.
--
-- The inbox of bank notices stays personal: it is read from each person's own
-- mail, so its tables keep their "own rows" policies.

create table public.members (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  space_id   uuid        not null references auth.users (id) on delete cascade,
  name       text        not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index members_space on public.members (space_id);

create table private.invites (
  email      text        primary key check (email = lower(btrim(email))),
  space_id   uuid        not null references auth.users (id) on delete cascade,
  name       text        not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
revoke all on private.invites from public, anon, authenticated;

-- The space the signed-in person works in: the one they are a member of, or
-- their own when they share with nobody.
create function public.my_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.space_id from public.members m where m.user_id = (select auth.uid())),
    (select auth.uid())
  );
$$;
revoke all on function public.my_space() from public, anon;
grant execute on function public.my_space() to authenticated;

alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;
create policy "my space" on public.members for select to authenticated
  using (space_id = (select public.my_space()));

-- An invited email joins its space when the account is created.
create function private.join_invited_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (user_id, space_id, name)
  select new.id, i.space_id, i.name
  from private.invites i
  where i.email = lower(btrim(new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.join_invited_space() from public, anon, authenticated;

create trigger join_invited_space
  after insert on auth.users
  for each row execute function private.join_invited_space();

alter table public.expenses add column created_by uuid references auth.users (id) on delete set null;
alter table public.payments add column created_by uuid references auth.users (id) on delete set null;
alter table public.messages add column created_by uuid references auth.users (id) on delete set null;
alter table public.accounts add column owner_id   uuid references auth.users (id) on delete set null;
alter table public.settings
  add column member_defaults jsonb not null default '{}'::jsonb
    check (jsonb_typeof(member_defaults) = 'object');

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'expenses', 'payments', 'messages', 'settings'] loop
    -- A row written without naming its owner lands in the writer's space.
    execute format('alter table public.%I alter column user_id set default public.my_space()', t);
    execute format('drop policy "own rows" on public.%I', t);
    execute format(
      'create policy "space rows" on public.%I for all to authenticated '
      'using (user_id = (select public.my_space())) with check (user_id = (select public.my_space()))',
      t
    );
  end loop;
end;
$$;
