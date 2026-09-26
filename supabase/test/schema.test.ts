import { PGlite } from "@electric-sql/pglite";
import INIT from "../migrations/20260925234152_init.sql?raw";
import ALLOWLIST from "../migrations/20260926014507_allowlist.sql?raw";
import INBOX_RULES from "../migrations/20260926165324_inbox_rules.sql?raw";
import INBOX_RECEIVER from "../migrations/20260926172331_inbox_receiver.sql?raw";
import { beforeAll, describe, expect, it } from "vitest";
import { deliver } from "../../inbox/src/receiver";

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
  await db.exec(INBOX_RULES);
  await db.exec(INBOX_RECEIVER);
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
      ["accounts", "expenses", "inbox_items", "inbox_tokens", "inbox_unmatched", "messages", "payments", "settings"].map((name) => ({ name, rls: true })),
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

describe("what the inbox learns", () => {
  it("keeps the last four digits of each account's cards", async () => {
    await as(ANA, () => db.query(`insert into public.accounts (id, name, cards) values ('lulo', 'Lulo', '{4007,1234}')`));
    expect(await as(ANA, () => rows(`select cards from public.accounts where id = 'lulo'`))).toEqual([{ cards: ["4007", "1234"] }]);
    await expect(as(ANA, () => db.query(`insert into public.accounts (id, name, cards) values ('x', 'X', '{40071}')`))).rejects.toThrow(/check/);
    await expect(as(ANA, () => db.query(`insert into public.accounts (id, name, cards) values ('y', 'Y', '{abcd}')`))).rejects.toThrow(/check/);
    expect(await as(ANA, () => rows(`select cards from public.accounts where id = 'efectivo-sin-tarjetas'`))).toEqual([]);
  });

  it("starts accounts without cards and settings without rules", async () => {
    await as(BETO, () => db.query(`insert into public.accounts (id, name) values ('efectivo', 'Efectivo')`));
    await as(BETO, () => db.query(`insert into public.settings (currency) values ('COP') on conflict (user_id) do nothing`));
    expect(await as(BETO, () => rows(`select cards from public.accounts where id = 'efectivo'`))).toEqual([{ cards: [] }]);
    expect(await as(BETO, () => rows(`select merchant_categories from public.settings`))).toEqual([{ merchant_categories: {} }]);
  });

  it("stores merchant rules as an object", async () => {
    await as(ANA, () =>
      db.query(
        `insert into public.settings (currency, merchant_categories) values ('COP', '{"americanino": "ropa"}')
         on conflict (user_id) do update set merchant_categories = excluded.merchant_categories`,
      ),
    );
    expect(await as(ANA, () => rows(`select merchant_categories from public.settings`))).toEqual([{ merchant_categories: { americanino: "ropa" } }]);
    await expect(as(ANA, () => db.query(`update public.settings set merchant_categories = '["ropa"]'`))).rejects.toThrow(/check/);
  });
});

describe("the mailbox", () => {
  const sha = async (t: string) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const ID = "1234|37500|2026-03-04|08:12";
  const notice = (kind: string, text: string, merchant = "Panaderia") => ({
    id: ID,
    amount: 37500,
    merchant,
    last4: "1234",
    date: "2026-03-04",
    time: "08:12",
    credit: kind === "lulo-email",
    notice: { kind, text },
  });
  const receive = (token: string, item: object) =>
    as(null, async () => (await rows(`select public.receive_notice($1, $2::jsonb) as r`, [token, JSON.stringify(item)]))[0].r);

  beforeAll(async () => {
    const hash = await sha("clave-de-ana");
    await as(ANA, () => db.query(`insert into public.inbox_tokens (token_hash) values ($1)`, [hash]));
  });

  it("drops a notice into the owner's inbox with only the mailbox key", async () => {
    expect(await receive("clave-de-ana", notice("lulo-sms", "SMS de la compra"))).toBe("new");
    const items = await as(ANA, () => rows(`select id, amount, merchant, status, source, jsonb_array_length(notices) as n from public.inbox_items where id = $1`, [ID]));
    expect(items).toEqual([{ id: "1234|37500|2026-03-04|08:12", amount: "37500.00", merchant: "Panaderia", status: "pending", source: "bank", n: 1 }]);
    expect(await as(BETO, () => rows(`select * from public.inbox_items where id = $1`, [ID]))).toEqual([]);
    const used = await as(ANA, () => rows(`select last_used_at from public.inbox_tokens`));
    expect(used[0].last_used_at).not.toBeNull();
  });

  it("joins the email and the SMS of one purchase, once each", async () => {
    expect(await receive("clave-de-ana", notice("lulo-sms", "SMS de la compra"))).toBe("known");
    expect(await receive("clave-de-ana", notice("lulo-email", "Correo de la compra", "Panaderia La Espiga"))).toBe("merged");
    const [item] = await as(ANA, () => rows(`select merchant, credit, notices from public.inbox_items where id = $1`, [ID]));
    expect(item.merchant).toBe("Panaderia La Espiga");
    expect(item.credit).toBe(true);
    expect((item.notices as { kind: string }[]).map((n) => n.kind)).toEqual(["lulo-sms", "lulo-email"]);
  });

  it("does not bring back a purchase already handled", async () => {
    await as(ANA, () => db.query(`update public.inbox_items set status = 'saved' where id = $1`, [ID]));
    expect(await receive("clave-de-ana", notice("bogota-sms", "Otro aviso"))).toBe("merged");
    expect(await as(ANA, () => rows(`select status from public.inbox_items where id = $1`, [ID]))).toEqual([{ status: "saved" }]);
  });

  it("refuses a wrong key and anything the inbox would not accept", async () => {
    await expect(receive("clave-falsa", notice("lulo-sms", "x"))).rejects.toThrow(/Clave del buzón inválida/);
    await expect(receive("", notice("lulo-sms", "x"))).rejects.toThrow(/Clave del buzón inválida/);
    await expect(receive("clave-de-ana", { ...notice("lulo-sms", "x"), id: "otro", amount: 0 })).rejects.toThrow(/check/);
    await expect(receive("clave-de-ana", { ...notice("lulo-sms", "x"), id: "otro", time: "25:99" })).rejects.toThrow(/check/);
  });

  it("keeps the latest ten unreadable messages for the owner only", async () => {
    for (let i = 0; i < 12; i++) {
      await as(null, () => db.query(`select public.receive_unmatched($1, $2, $3, $4)`, ["clave-de-ana", "forwarding-noreply@google.com", `Asunto ${i}`, `Cuerpo ${i}`]));
    }
    const kept = await as(ANA, () => rows(`select subject from public.inbox_unmatched order by id`));
    expect(kept.map((r) => r.subject)).toEqual(Array.from({ length: 10 }, (_, i) => `Asunto ${i + 2}`));
    expect(await as(BETO, () => rows(`select * from public.inbox_unmatched`))).toEqual([]);
    await as(ANA, () => db.query(`delete from public.inbox_unmatched where subject = 'Asunto 2'`));
    expect(await as(ANA, () => rows(`select count(*)::int as n from public.inbox_unmatched`))).toEqual([{ n: 9 }]);
  });

  it("receives what the mailbox sends, end to end", async () => {
    // The mailbox's requests, answered by the real functions as the signed-out role.
    const postgrest = async (url: string, init: RequestInit) => {
      const name = url.split("/rpc/")[1];
      const args = JSON.parse(init.body as string) as Record<string, unknown>;
      try {
        const [r] = await as(null, () =>
          name === "receive_notice"
            ? rows(`select public.receive_notice($1, $2::jsonb) as r`, [args.p_token, JSON.stringify(args.p_item)])
            : rows(`select public.receive_unmatched($1, $2, $3, $4) as r`, [args.p_token, args.p_sender, args.p_subject, args.p_body]),
        );
        return new Response(JSON.stringify(r.r ?? null), { status: 200 });
      } catch (err) {
        return new Response(JSON.stringify({ message: (err as Error).message }), { status: 400 });
      }
    };
    const to = { url: "https://x.supabase.co", key: "k", token: "clave-de-ana" };
    const sms =
      "Lulo Bank: Compra realizada por $22,000 en MULTICINE UNICENTRO con tu tarjeta terminada en *1234. Fecha 5 de marzo de 2026. Hora 6:51 p.m.";
    expect(await deliver({ text: sms }, to, postgrest)).toMatchObject({ status: "new", amount: 22000 });
    expect(await deliver({ text: sms }, to, postgrest)).toMatchObject({ status: "known" });
    const [item] = await as(ANA, () => rows(`select amount, merchant, last4, date::text, time from public.inbox_items where id = '1234|22000|2026-03-05|18:51'`));
    expect(item).toEqual({ amount: "22000.00", merchant: "Multicine Unicentro", last4: "1234", date: "2026-03-05", time: "18:51" });
    await expect(deliver({ text: sms }, { ...to, token: "otra" }, postgrest)).rejects.toThrow(/Clave del buzón inválida/);
  });

  it("keeps keys and messages away from anyone signed out", async () => {
    const stolen = await sha("robada");
    await expect(as(null, () => rows(`select * from public.inbox_tokens`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => rows(`select * from public.inbox_unmatched`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => rows(`select private.inbox_owner('clave-de-ana')`))).rejects.toThrow(/permission denied/);
    await expect(as(BETO, () => db.query(`update public.inbox_tokens set token_hash = $1`, [stolen]))).resolves.toMatchObject({ affectedRows: 0 });
    await expect(as(ANA, () => db.query(`insert into public.inbox_unmatched (body) values ('falso')`))).rejects.toThrow(/permission denied/);
  });
});
