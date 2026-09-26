import { SETTINGS_ID, type Row, type Table } from "./rows";

/** A row as PostgREST sends and receives it: snake_case, timestamps as ISO text. */
export type RemoteRow = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["expense", "payment", "plain", "query", "undo", "help"]);

const isText = (v: unknown): v is string => typeof v === "string";
const isDate = (v: unknown): v is string => isText(v) && DATE.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && !Number.isNaN(new Date(v).getTime());
const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e12;
const textOrNull = (v: unknown) => (isText(v) && v ? v : null);
const money = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const time = (v: unknown) => (isText(v) ? Date.parse(v) : NaN);
/** Old data may lack a creation time; noon of its day is close enough to keep the order. */
const createdOrNoon = (r: Row) => (isTime(r.createdAt) ? r.createdAt : Date.parse(`${r.date as string}T12:00:00Z`));

/**
 * The row to upload, or null when the database would reject it (a zero
 * amount, a malformed date). Such a row stays on the phone and is skipped.
 */
export function toRemote(table: Table, r: Row): RemoteRow | null {
  switch (table) {
    case "accounts":
      if (!isText(r.name)) return null;
      return {
        id: r.id,
        name: r.name,
        emoji: isText(r.emoji) && r.emoji ? r.emoji : "💳",
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
        credit: !!r.credit,
        initial_debt: typeof r.initialDebt === "number" && r.initialDebt > 0 && r.initialDebt < 1e12 ? money(r.initialDebt) : 0,
        position: typeof r.position === "number" ? r.position : 0,
        deleted_at: null,
      };
    case "settings":
      return { currency: isText(r.currency) ? r.currency : "COP", default_account: textOrNull(r.defaultAccount) };
    case "expenses":
      if (!isAmount(r.amount) || !isDate(r.date) || !isText(r.category) || !isText(r.description)) return null;
      return {
        id: r.id,
        amount: money(r.amount),
        category: r.category,
        account_id: textOrNull(r.account),
        description: r.description,
        date: r.date,
        created_at: new Date(createdOrNoon(r)).toISOString(),
        source: textOrNull(r.source),
        installments: typeof r.installments === "number" && Number.isInteger(r.installments) && r.installments > 1 ? r.installments : null,
        deleted_at: null,
      };
    case "payments":
      if (!isAmount(r.amount) || !isDate(r.date) || !isText(r.toAccount)) return null;
      return {
        id: r.id,
        amount: money(r.amount),
        to_account: r.toAccount,
        from_account: textOrNull(r.fromAccount),
        date: r.date,
        created_at: new Date(createdOrNoon(r)).toISOString(),
        source: textOrNull(r.source),
        deleted_at: null,
      };
    case "messages":
      if (!isText(r.text) || !KINDS.has(r.kind as string) || !isTime(r.createdAt)) return null;
      if (r.date !== null && !isDate(r.date)) return null;
      return {
        id: r.id,
        text: r.text,
        kind: r.kind,
        created_at: new Date(r.createdAt).toISOString(),
        expense_ids: Array.isArray(r.expenseIds) && r.expenseIds.length ? r.expenseIds : null,
        payment_id: textOrNull(r.paymentId),
        note: textOrNull(r.note),
        date: r.date,
        deleted_at: null,
      };
  }
}

/** What a downloaded row means for the phone: a row to keep, or the id of one deleted elsewhere. */
export type Change = { deleted: false; row: Row; updatedAt: string } | { deleted: true; id: string; updatedAt: string };

/**
 * Reads a downloaded row. Returns null for anything the phone could not use
 * (another source wrote something odd): it is ignored rather than breaking sync.
 */
export function fromRemote(table: Table, r: RemoteRow): Change | null {
  const updatedAt = isText(r.updated_at) ? r.updated_at : "";
  if (table === "settings") {
    return { deleted: false, updatedAt, row: { id: SETTINGS_ID, currency: isText(r.currency) ? r.currency : "COP", defaultAccount: textOrNull(r.default_account) } };
  }
  if (!isText(r.id) || !r.id) return null;
  if (r.deleted_at) return { deleted: true, id: r.id, updatedAt };
  switch (table) {
    case "accounts": {
      if (!isText(r.name)) return null;
      const debt = num(r.initial_debt);
      return {
        deleted: false,
        updatedAt,
        row: {
          id: r.id,
          name: r.name,
          emoji: isText(r.emoji) && r.emoji ? r.emoji : "💳",
          aliases: Array.isArray(r.aliases) ? r.aliases.filter(isText) : [],
          credit: r.credit === true,
          initialDebt: debt > 0 ? debt : 0,
          position: Number.isFinite(num(r.position)) ? num(r.position) : 0,
        },
      };
    }
    case "expenses": {
      const amount = num(r.amount);
      const createdAt = time(r.created_at);
      if (!isAmount(amount) || !isDate(r.date) || !isTime(createdAt) || !isText(r.category)) return null;
      return {
        deleted: false,
        updatedAt,
        row: {
          id: r.id,
          amount,
          category: r.category,
          account: textOrNull(r.account_id),
          description: isText(r.description) ? r.description : "",
          date: r.date,
          createdAt,
          source: textOrNull(r.source),
          installments: typeof r.installments === "number" && r.installments > 1 ? r.installments : null,
        },
      };
    }
    case "payments": {
      const amount = num(r.amount);
      const createdAt = time(r.created_at);
      if (!isAmount(amount) || !isDate(r.date) || !isTime(createdAt) || !isText(r.to_account)) return null;
      return {
        deleted: false,
        updatedAt,
        row: { id: r.id, amount, toAccount: r.to_account, fromAccount: textOrNull(r.from_account), date: r.date, createdAt, source: textOrNull(r.source) },
      };
    }
    case "messages": {
      const createdAt = time(r.created_at);
      if (!isText(r.text) || !KINDS.has(r.kind as string) || !isTime(createdAt)) return null;
      const ids = Array.isArray(r.expense_ids) ? r.expense_ids.filter(isText) : [];
      return {
        deleted: false,
        updatedAt,
        row: {
          id: r.id,
          text: r.text,
          kind: r.kind as string,
          createdAt,
          expenseIds: ids.length ? ids : null,
          paymentId: textOrNull(r.payment_id),
          note: textOrNull(r.note),
          date: isDate(r.date) ? r.date : null,
        },
      };
    }
  }
}
