-- Only the emails listed here can create an account. Supabase has a switch that
-- turns sign-ups off altogether, but it would also stop the owner from creating
-- theirs; this keeps the door open for exactly the allowed emails and nobody else.
--
-- The list lives in a schema the API does not expose, and the emails are data
-- rather than part of this migration, so they never end up in the public repo.
-- To allow someone, from the SQL editor:
--   insert into private.allowed_emails (email) values ('someone@example.com');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_emails (
  email      text        primary key check (email = lower(btrim(email))),
  created_at timestamptz not null default now()
);
revoke all on private.allowed_emails from public, anon, authenticated;

create function private.email_is_allowed(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.allowed_emails where email = lower(btrim(candidate)));
$$;

create function private.only_allowed_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not private.email_is_allowed(new.email) then
    raise exception 'Este correo no tiene acceso a Contame' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.email_is_allowed(text) from public, anon, authenticated;
revoke all on function private.only_allowed_emails() from public, anon, authenticated;

-- Also on email changes, so an allowed account cannot move to another address.
create trigger only_allowed_emails
  before insert or update of email on auth.users
  for each row execute function private.only_allowed_emails();
