import { PGlite } from "@electric-sql/pglite";
import INIT from "../migrations/20260925234152_init.sql?raw";
import ALLOWLIST from "../migrations/20260926014507_allowlist.sql?raw";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration on an in-process Postgres with a minimal stand-in for
 * what Supabase provides: the auth schema, auth.uid() read from the request's
 * claims, and the anon and authenticated roles. That is enough to check that
 * row level security really keeps each user to their own rows.
 */

const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";

const SUPABASE_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  grant usage on schema public to anon, authenticated;
  insert into auth.users values ('${ANA}'), ('${BETO}');
`;

let db: PGlite;

/** Runs the statements as a signed-in user, like a request from the app would. */
async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(user ? `set role authenticated` : `set role anon`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [user ? JSON.stringify({ sub: user }) : ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];

const expense = (id: string, amount = 18500) =>
  db.query(
    `insert into public.expenses (id, amount, category, description, date, created_at) values ($1, $2, 'comida', 'Almuerzo', '2026-09-20', now())`,
    [id, amount],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  await db.exec(INIT);
  await db.exec(ALLOWLIST);
  // The role Supabase Auth writes auth.users with. Not a superuser, like in production.
  await db.exec(`create role supabase_auth_admin nologin; grant usage on schema auth to supabase_auth_admin;
    grant select, insert, update on auth.users to supabase_auth_admin;`);
});

describe("row level security", () => {
  it("fills in the owner from the session and shows each user only their rows", async () => {
    await as(ANA, () => expense("ana-1"));
    await as(BETO, () => expense("beto-1", 9000));

    expect(await as(ANA, () => rows(`select id, user_id from public.expenses`))).toEqual([{ id: "ana-1", user_id: ANA }]);
    expect(await as(BETO, () => rows(`select id from public.expenses`))).toEqual([{ id: "beto-1" }]);
  });

  it("does not let a user write rows in someone else's name", async () => {
    await expect(
      as(ANA, () =>
        db.query(
          `insert into public.expenses (user_id, id, amount, category, description, date, created_at) values ($1, 'x', 1000, 'otros', 'x', '2026-09-20', now())`,
          [BETO],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("does not let a user change or delete someone else's rows", async () => {
    await as(BETO, () => db.query(`update public.expenses set amount = 1 where id = 'ana-1'`));
    await as(BETO, () => db.query(`delete from public.expenses where id = 'ana-1'`));
    expect(await as(ANA, () => rows(`select amount from public.expenses where id = 'ana-1'`))).toEqual([{ amount: "18500.00" }]);
  });

  it("does not let a user hand a row over to someone else", async () => {
    await expect(as(ANA, () => db.query(`update public.expenses set user_id = $1 where id = 'ana-1'`, [BETO]))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("gives nothing to someone who is not signed in", async () => {
    await expect(as(null, () => rows(`select * from public.expenses`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => rows(`select * from public.inbox_items`))).rejects.toThrow(/permission denied/);
  });

  it("covers every table", async () => {
    const tables = await rows(
      `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(tables).toEqual(
      ["accounts", "expenses", "inbox_items", "messages", "payments", "settings"].map((name) => ({ name, rls: true })),
    );
  });
});

describe("sync support", () => {
  it("sets updated_at on the server and ignores the device's clock", async () => {
    await as(ANA, () =>
      db.query(
        `insert into public.payments (id, amount, to_account, date, created_at, updated_at) values ('p1', 318000, 'tc', '2026-09-20', now(), '2001-01-01')`,
      ),
    );
    const [first] = await as(ANA, () => rows(`select updated_at from public.payments where id = 'p1'`));
    expect(new Date(first.updated_at as string).getFullYear()).toBeGreaterThan(2020);

    await new Promise((r) => setTimeout(r, 10));
    await as(ANA, () => db.query(`update public.payments set amount = 300000 where id = 'p1'`));
    const [second] = await as(ANA, () => rows(`select updated_at from public.payments where id = 'p1'`));
    expect(new Date(second.updated_at as string).getTime()).toBeGreaterThan(new Date(first.updated_at as string).getTime());
  });

  it("keeps soft-deleted rows so the deletion can reach other devices", async () => {
    await as(ANA, () => db.query(`update public.expenses set deleted_at = now() where id = 'ana-1'`));
    expect(await as(ANA, () => rows(`select id from public.expenses where deleted_at is not null`))).toEqual([{ id: "ana-1" }]);
  });

  it("lets a device upload a row it created offline, keeping its own id", async () => {
    await as(ANA, () =>
      db.query(
        `insert into public.expenses (id, amount, category, description, date, created_at) values ('offline-1', 5000, 'transporte', 'Bus', '2026-09-19', now())
         on conflict (user_id, id) do update set amount = excluded.amount`,
      ),
    );
    await as(ANA, () =>
      db.query(
        `insert into public.expenses (id, amount, category, description, date, created_at) values ('offline-1', 5500, 'transporte', 'Bus', '2026-09-19', now())
         on conflict (user_id, id) do update set amount = excluded.amount`,
      ),
    );
    expect(await as(ANA, () => rows(`select amount from public.expenses where id = 'offline-1'`))).toEqual([{ amount: "5500.00" }]);
  });
});

describe("inbox", () => {
  const item = (id: string) =>
    db.query(
      `insert into public.inbox_items (id, amount, merchant, last4, date, time, source) values ($1, 90940, 'Americanino', '4007', '2026-09-20', '18:01', 'bank')`,
      [id],
    );

  it("lets two users hold the same matching key, since it is only unique per user", async () => {
    await as(ANA, () => item("4007|90940|2026-09-20|18:01"));
    await as(BETO, () => item("4007|90940|2026-09-20|18:01"));
    expect(await as(ANA, () => rows(`select status from public.inbox_items`))).toEqual([{ status: "pending" }]);
  });

  it("rejects values the app would not understand", async () => {
    await expect(as(ANA, () => db.query(`update public.inbox_items set status = 'maybe'`))).rejects.toThrow(/check/);
    await expect(as(ANA, () => db.query(`update public.inbox_items set time = '6:01 pm'`))).rejects.toThrow(/check/);
    await expect(as(ANA, () => db.query(`update public.inbox_items set source = 'magic'`))).rejects.toThrow(/check/);
  });
});

describe("constraints", () => {
  it("refuses amounts that are not positive and unknown origins", async () => {
    await expect(as(ANA, () => expense("zero", 0))).rejects.toThrow(/check/);
    await expect(as(ANA, () => db.query(`update public.expenses set origin = 'telepathy' where id = 'offline-1'`))).rejects.toThrow(/check/);
  });
});

describe("allowed emails", () => {
  /** Writes auth.users the way Supabase Auth does when someone signs up or changes email. */
  const asAuth = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.exec(`set role supabase_auth_admin`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  };
  const signUp = (email: string | null) => asAuth(() => db.query(`insert into auth.users (id, email) values (gen_random_uuid(), $1)`, [email]));

  it("refuses to create an account for an email that is not on the list", async () => {
    await expect(signUp("intruso@ejemplo.com")).rejects.toThrow(/no tiene acceso/);
    await expect(signUp(null)).rejects.toThrow(/no tiene acceso/);
  });

  it("lets the listed email in, however it is capitalised or padded", async () => {
    await db.query(`insert into private.allowed_emails (email) values ('duena@ejemplo.com')`);
    await expect(signUp(" Duena@Ejemplo.COM ")).resolves.toBeDefined();
  });

  it("does not let an account move to an address outside the list", async () => {
    await expect(
      asAuth(() => db.query(`update auth.users set email = 'otra@ejemplo.com' where email = ' Duena@Ejemplo.COM '`)),
    ).rejects.toThrow(/no tiene acceso/);
  });

  it("keeps the list out of reach of the app and of anyone signed out", async () => {
    await expect(as(ANA, () => rows(`select * from private.allowed_emails`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => rows(`select * from private.allowed_emails`))).rejects.toThrow(/permission denied/);
    await expect(as(ANA, () => rows(`select private.email_is_allowed('duena@ejemplo.com')`))).rejects.toThrow(/permission denied/);
  });

  it("only stores emails in a single normalised form", async () => {
    await expect(db.query(`insert into private.allowed_emails (email) values ('Mayus@Ejemplo.com')`)).rejects.toThrow(/check/);
  });
});
