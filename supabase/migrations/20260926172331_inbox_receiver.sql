-- The mailbox that receives bank notices (a val on Val Town, later a Shortcut)
-- and drops them into the person's inbox.
--
-- It does not sign in: it holds a mailbox key the app creates. The key only
-- lets it add notices to that one person's inbox, never read anything, and
-- the database keeps only its SHA-256 fingerprint.

create table public.inbox_tokens (
  user_id      uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash   text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- The mailbox's email address, only so the app can show it.
  address      text        check (address is null or length(address) <= 200),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- Messages the mailbox received but could not read as a purchase: Gmail's
-- forwarding confirmation, a template the bank changed. Only the latest few.
create table public.inbox_unmatched (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          bigint      generated always as identity primary key,
  received_at timestamptz not null default now(),
  sender      text,
  subject     text,
  body        text        not null
);

create index inbox_unmatched_latest on public.inbox_unmatched (user_id, received_at desc);

alter table public.inbox_tokens enable row level security;
alter table public.inbox_unmatched enable row level security;

create policy "own rows" on public.inbox_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.inbox_unmatched for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own rows delete" on public.inbox_unmatched for delete to authenticated
  using (user_id = (select auth.uid()));

-- Supabase grants everything on new tables by default; keep only what is used.
revoke all on public.inbox_tokens, public.inbox_unmatched from anon, authenticated;
grant select, insert, update, delete on public.inbox_tokens to authenticated;
grant select, delete on public.inbox_unmatched to authenticated;

-- Whose inbox a mailbox key opens, noting that it was used. Null for a wrong key.
create function private.inbox_owner(p_token text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.inbox_tokens
     set last_used_at = pg_catalog.now()
   where token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  returning user_id;
$$;

revoke all on function private.inbox_owner(text) from public;

-- Adds a purchase notice to the inbox. Two notices of one purchase (the email
-- and the SMS) share the id and become one item with both notices. A notice
-- for a purchase already saved or discarded is recorded but does not bring it
-- back. Returns 'new', 'merged' or 'known'.
create function public.receive_notice(p_token text, p_item jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.inbox_owner(p_token);
  item_id text := left(p_item ->> 'id', 100);
  notice  jsonb;
  current public.inbox_items;
begin
  if uid is null then
    raise exception 'Clave del buzón inválida' using errcode = '28000';
  end if;
  notice := pg_catalog.jsonb_build_object(
    'kind', left(coalesce(p_item -> 'notice' ->> 'kind', ''), 40),
    'text', left(coalesce(p_item -> 'notice' ->> 'text', ''), 4000),
    'receivedAt', pg_catalog.now()
  );

  insert into public.inbox_items (user_id, id, amount, merchant, last4, date, time, credit, source, notices)
  values (
    uid,
    item_id,
    (p_item ->> 'amount')::numeric,
    left(coalesce(nullif(btrim(p_item ->> 'merchant'), ''), 'Compra'), 200),
    nullif(p_item ->> 'last4', ''),
    (p_item ->> 'date')::date,
    p_item ->> 'time',
    coalesce((p_item ->> 'credit')::boolean, false),
    'bank',
    pg_catalog.jsonb_build_array(notice)
  )
  on conflict (user_id, id) do nothing;
  if found then
    return 'new';
  end if;

  select * into current from public.inbox_items where user_id = uid and id = item_id for update;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(current.notices) n
     where n ->> 'kind' = notice ->> 'kind' and n ->> 'text' = notice ->> 'text'
  ) or pg_catalog.jsonb_array_length(current.notices) >= 10 then
    return 'known';
  end if;
  update public.inbox_items
     set notices  = current.notices || pg_catalog.jsonb_build_array(notice),
         -- Keep whichever merchant name says more.
         merchant = case when length(btrim(coalesce(p_item ->> 'merchant', ''))) > length(current.merchant)
                         then left(btrim(p_item ->> 'merchant'), 200) else current.merchant end,
         credit   = current.credit or coalesce((p_item ->> 'credit')::boolean, false)
   where user_id = uid and id = item_id;
  return 'merged';
end;
$$;

-- Keeps a message the mailbox could not read, so the person can see it arrived.
create function public.receive_unmatched(p_token text, p_sender text, p_subject text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.inbox_owner(p_token);
begin
  if uid is null then
    raise exception 'Clave del buzón inválida' using errcode = '28000';
  end if;
  insert into public.inbox_unmatched (user_id, sender, subject, body)
  values (uid, left(p_sender, 200), left(p_subject, 300), left(coalesce(p_body, ''), 4000));
  delete from public.inbox_unmatched
   where user_id = uid
     and id not in (select id from public.inbox_unmatched where user_id = uid order by received_at desc, id desc limit 10);
end;
$$;

revoke all on function public.receive_notice(text, jsonb) from public;
revoke all on function public.receive_unmatched(text, text, text, text) from public;
grant execute on function public.receive_notice(text, jsonb) to anon, authenticated;
grant execute on function public.receive_unmatched(text, text, text, text) to anon, authenticated;
