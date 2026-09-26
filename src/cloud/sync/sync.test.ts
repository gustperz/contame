import { describe, expect, it } from "vitest";
import { emptyState, MAX_MESSAGES, type AppState } from "../../storage/store";
import type { ChatMessage, Expense, Payment } from "../../domain/types";
import { applyIncoming, emptyIncoming } from "./apply";
import { emptySnapshot, outgoing, type Snapshot } from "./diff";
import { pendingChanges, syncOnce, type Transport } from "./engine";
import { fromRemote, toRemote, type RemoteRow } from "./remote";
import { expenseRow, hashRow, messageRow, paymentRow, rowsOf, SETTINGS_ID, TABLES, toExpense, type Table } from "./rows";

const USER = "11111111-1111-1111-1111-111111111111";

/** An in-memory stand-in for the database: server clock, soft deletes, upserts. */
class FakeServer {
  tables = new Map<Table, Map<string, RemoteRow>>(TABLES.map((t) => [t, new Map()]));
  clock = Date.parse("2026-09-26T12:00:00Z");
  offline = false;
  calls = 0;

  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  transport(): Transport {
    const check = () => {
      this.calls++;
      if (this.offline) throw new TypeError("Failed to fetch");
    };
    return {
      upsert: async (table, rows) => {
        check();
        for (const r of rows) {
          const id = table === "settings" ? SETTINGS_ID : (r.id as string);
          const prev = this.tables.get(table)!.get(id) ?? {};
          this.tables.get(table)!.set(id, { ...prev, ...r, updated_at: this.tick() });
        }
      },
      remove: async (table, ids) => {
        check();
        for (const id of ids) {
          const prev = this.tables.get(table)!.get(id);
          if (prev) this.tables.get(table)!.set(id, { ...prev, deleted_at: new Date(this.clock).toISOString(), updated_at: this.tick() });
        }
      },
      changes: async (table, since) => {
        check();
        return [...this.tables.get(table)!.values()]
          .filter((r) => !since || Date.parse(r.updated_at as string) >= Date.parse(since))
          .sort((a, b) => Date.parse(a.updated_at as string) - Date.parse(b.updated_at as string));
      },
    };
  }

  live(table: Table) {
    return [...this.tables.get(table)!.values()].filter((r) => !r.deleted_at);
  }
}

/** A phone: its local state and its sync snapshot. */
class Phone {
  snap: Snapshot | null = null;
  constructor(public state: AppState, private server: FakeServer, private user = USER) {}
  async sync() {
    const res = await syncOnce(this.state, this.snap, this.user, this.server.transport());
    if (res.status === "ok") {
      this.state = applyIncoming(this.state, res.incoming);
      this.snap = res.snapshot;
    }
    return res;
  }
  edit(fn: (s: AppState) => AppState) {
    this.state = fn(this.state);
  }
}

let seq = 0;
function expense(extra: Partial<Expense> = {}): Expense {
  seq++;
  return { id: `e${seq}`, amount: 10000 + seq, category: "comida", description: `gasto ${seq}`, date: "2026-09-20", createdAt: 1_790_000_000_000 + seq, ...extra };
}
function message(extra: Partial<ChatMessage> = {}): ChatMessage {
  seq++;
  return { id: `m${seq}`, text: `mensaje ${seq}`, kind: "plain", createdAt: 1_790_000_000_000 + seq, ...extra };
}
const withExpenses = (s: AppState, ...es: Expense[]): AppState => ({ ...s, expenses: [...s.expenses, ...es] });

describe("rows and remote mapping", () => {
  it("round-trips every kind of row unchanged", () => {
    const state: AppState = {
      ...emptyState(),
      settings: {
        currency: "COP",
        defaultAccount: "lulo",
        accounts: [
          { id: "efectivo", name: "Efectivo", emoji: "💵", aliases: ["efectivo"] },
          { id: "lulo", name: "Lulo", emoji: "💳", aliases: ["lulo", "tc"], credit: true, initialDebt: 1250.5, cards: ["4007"] },
        ],
        merchantCategories: { americanino: "ropa" },
      },
      expenses: [expense({ account: "lulo", installments: 3, source: "almuerzo 15 mil" }), expense({ origin: "bank" })],
      payments: [{ id: "p1", amount: 318000, toAccount: "lulo", fromAccount: "efectivo", date: "2026-09-21", createdAt: 1_790_000_100_000 }],
      messages: [message({ kind: "expense", expenseIds: ["e1"] }), message({ kind: "query", note: "Gastaste $0", date: "2026-09-19" })],
    };
    const rows = rowsOf(state);
    for (const table of TABLES) {
      for (const row of rows[table].values()) {
        const remote = toRemote(table, row)!;
        expect(remote).not.toBeNull();
        const back = fromRemote(table, { ...remote, id: remote.id ?? SETTINGS_ID, updated_at: "2026-09-26T00:00:00Z", created_at: remote.created_at });
        expect(back).toMatchObject({ deleted: false, row });
        if (back && !back.deleted) expect(hashRow(back.row)).toBe(hashRow(row));
      }
    }
  });

  it("keeps the fingerprint of rows written before cards, origins and merchant rules existed", () => {
    const e = expense();
    expect(hashRow(expenseRow(e))).toBe(hashRow({ ...expenseRow(e), origin: undefined }));
    const remote = toRemote("expenses", expenseRow(e))!;
    expect(remote.origin).toBe("app");
    const back = fromRemote("expenses", { ...remote, updated_at: "2026-09-26T00:00:00Z" });
    expect(back && !back.deleted && hashRow(back.row)).toBe(hashRow(expenseRow(e)));
    const settings = rowsOf(emptyState()).settings.get(SETTINGS_ID)!;
    expect(fromRemote("settings", { ...toRemote("settings", settings)!, updated_at: "2026-09-26T00:00:00Z" })).toMatchObject({ row: settings });
  });

  it("reads numbers that come back as text and ISO timestamps", () => {
    const change = fromRemote("expenses", {
      id: "x",
      amount: "15000.00",
      category: "comida",
      account_id: null,
      description: "almuerzo",
      date: "2026-09-26",
      created_at: "2026-09-26T15:04:05.123+00:00",
      source: null,
      installments: null,
      updated_at: "2026-09-26T15:04:06Z",
      deleted_at: null,
    });
    expect(change).toMatchObject({ deleted: false, row: { amount: 15000, createdAt: Date.parse("2026-09-26T15:04:05.123Z") } });
  });

  it("reports deletions and ignores unusable rows", () => {
    expect(fromRemote("expenses", { id: "x", deleted_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z" })).toEqual({
      deleted: true,
      id: "x",
      updatedAt: "2026-09-26T00:00:00Z",
    });
    expect(fromRemote("expenses", { id: "x", amount: 0, category: "comida", date: "2026-09-26", created_at: "2026-09-26T00:00:00Z" })).toBeNull();
    expect(fromRemote("messages", { id: "x", text: "hola", kind: "chisme", created_at: "2026-09-26T00:00:00Z" })).toBeNull();
  });

  it("refuses rows the database would reject", () => {
    expect(toRemote("expenses", expenseRow(expense({ amount: 0 })))).toBeNull();
    expect(toRemote("expenses", expenseRow(expense({ date: "ayer" })))).toBeNull();
    expect(toRemote("payments", paymentRow({ id: "p", amount: -5, toAccount: "x", date: "2026-09-01", createdAt: 1 }))).toBeNull();
    expect(toRemote("messages", messageRow(message({ kind: "otro" as ChatMessage["kind"] })))).toBeNull();
    // Installments of 1 are not installments.
    expect(toRemote("expenses", expenseRow(expense({ installments: 1 })))!.installments).toBeNull();
  });

  it("gives old expenses without a creation time one from their date", () => {
    const old = { ...expense({ date: "2026-01-15" }), createdAt: undefined as unknown as number };
    expect(toRemote("expenses", expenseRow(old))!.created_at).toBe("2026-01-15T12:00:00.000Z");
  });

  it("converts rows back to domain objects without empty fields", () => {
    const e = expense();
    expect(toExpense(expenseRow(e))).toEqual(e);
  });
});

describe("outgoing changes", () => {
  it("sends new and changed rows and deletes removed ones", () => {
    const a = expense();
    const b = expense();
    const snap = emptySnapshot(USER);
    snap.hashes.expenses = { [a.id]: hashRow(expenseRow(a)), [b.id]: hashRow(expenseRow(b)), gone: "x" };
    const state = withExpenses(emptyState(), a, { ...b, amount: 1 }, expense());
    const out = outgoing(rowsOf(state), snap);
    expect(out.upserts.expenses.map((r) => r.id)).toEqual([b.id, `e${seq}`]);
    expect(out.deletes.expenses).toEqual(["gone"]);
  });

  it("does not delete messages the phone trimmed to save space", () => {
    const old = message();
    const messages = Array.from({ length: MAX_MESSAGES }, () => message());
    const snap = emptySnapshot(USER);
    for (const m of [old, ...messages]) snap.hashes.messages[m.id] = hashRow(messageRow(m));
    for (const m of [old, ...messages]) snap.messageTimes[m.id] = m.createdAt;
    const out = outgoing(rowsOf({ ...emptyState(), messages }), snap);
    expect(out.trimmed).toEqual([old.id]);
    expect(out.deletes.messages).toEqual([]);
    // With room to spare, a missing message was deleted on purpose.
    const fewer = outgoing(rowsOf({ ...emptyState(), messages: messages.slice(1) }), snap);
    expect(fewer.deletes.messages).toContain(messages[0].id);
  });
});

describe("applying incoming changes", () => {
  it("merges rows, orders accounts by position and cleans the result", () => {
    const inc = emptyIncoming();
    inc.upserts.accounts.push({ id: "lulo", name: "Lulo", emoji: "💳", aliases: ["lulo"], credit: true, initialDebt: 0, position: 0 });
    inc.upserts.accounts.push({ id: "efectivo", name: "Efectivo", emoji: "💵", aliases: ["efectivo"], credit: false, initialDebt: 0, position: 1 });
    inc.upserts.expenses.push(expenseRow(expense({ account: "desconocida" })));
    inc.upserts.payments.push(paymentRow({ id: "p", amount: 5, toAccount: "desconocida", date: "2026-09-01", createdAt: 1 }));
    inc.upserts.settings.push({ id: SETTINGS_ID, currency: "USD", defaultAccount: "lulo" });
    const next = applyIncoming(emptyState(), inc);
    expect(next.settings.accounts.map((a) => a.id)).toEqual(["lulo", "efectivo"]);
    expect(next.settings.currency).toBe("USD");
    expect(next.settings.defaultAccount).toBe("lulo");
    expect(next.expenses[0].account).toBeUndefined();
    expect(next.payments).toEqual([]);
  });

  it("keeps messages in time order", () => {
    const later = message();
    const earlier = { ...message(), createdAt: 1 };
    const inc = emptyIncoming();
    inc.upserts.messages.push(messageRow(earlier));
    const next = applyIncoming({ ...emptyState(), messages: [later] }, inc);
    expect(next.messages.map((m) => m.id)).toEqual([earlier.id, later.id]);
  });
});

describe("sync between two phones", () => {
  it("uploads existing data on the first sync and brings it to a new phone", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), expense(), expense()), server);
    a.edit((s) => ({ ...s, messages: [message()], settings: { ...s.settings, currency: "USD" } }));
    const first = await a.sync();
    expect(first).toMatchObject({ status: "ok", sent: 5 });
    expect(server.live("expenses")).toHaveLength(2);

    const b = new Phone(emptyState(), server);
    await b.sync();
    expect(b.state.expenses.map((e) => e.id).sort()).toEqual(a.state.expenses.map((e) => e.id).sort());
    expect(b.state.messages).toHaveLength(1);
    // A new phone does not overwrite the setup of the old one.
    expect(b.state.settings.currency).toBe("USD");
    expect(pendingChanges(b.state, b.snap)).toBe(0);
  });

  it("merges data from two phones that both had expenses", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), expense()), server);
    const b = new Phone(withExpenses(emptyState(), expense()), server);
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.state.expenses).toHaveLength(2);
    expect(b.state.expenses).toHaveLength(2);
    expect(server.live("accounts")).toHaveLength(1);
  });

  it("carries edits and deletions to the other phone", async () => {
    const server = new FakeServer();
    const e1 = expense();
    const e2 = expense();
    const a = new Phone(withExpenses(emptyState(), e1, e2), server);
    await a.sync();
    const b = new Phone(emptyState(), server);
    await b.sync();

    a.edit((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== e1.id).map((e) => ({ ...e, amount: 99 })) }));
    await a.sync();
    await b.sync();
    expect(b.state.expenses).toEqual([{ ...e2, amount: 99 }]);
    expect(server.tables.get("expenses")!.get(e1.id)!.deleted_at).toBeTruthy();
  });

  it("keeps this phone's edit when both phones changed the same row", async () => {
    const server = new FakeServer();
    const e = expense();
    const a = new Phone(withExpenses(emptyState(), e), server);
    await a.sync();
    const b = new Phone(emptyState(), server);
    await b.sync();
    a.edit((s) => ({ ...s, expenses: [{ ...e, amount: 1 }] }));
    b.edit((s) => ({ ...s, expenses: [{ ...e, amount: 2 }] }));
    await a.sync();
    await b.sync();
    await a.sync();
    // The last phone to sync its own edit wins, and both end up the same.
    expect(a.state.expenses[0].amount).toBe(2);
    expect(b.state.expenses[0].amount).toBe(2);
  });

  it("works offline and sends the changes when back online", async () => {
    const server = new FakeServer();
    const a = new Phone(emptyState(), server);
    await a.sync();
    server.offline = true;
    a.edit((s) => withExpenses(s, expense(), expense()));
    await expect(a.sync()).rejects.toThrow("Failed to fetch");
    expect(pendingChanges(a.state, a.snap)).toBe(2);
    server.offline = false;
    await a.sync();
    expect(pendingChanges(a.state, a.snap)).toBe(0);
    expect(server.live("expenses")).toHaveLength(2);
  });

  it("asks nothing of the server twice once in agreement", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), expense()), server);
    await a.sync();
    const before = server.clock;
    const again = await a.sync();
    expect(again).toMatchObject({ status: "ok", sent: 0 });
    expect(server.clock).toBe(before);
  });

  it("never mixes data from another account", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), expense()), server);
    await a.sync();
    const other = new Phone(a.state, server, "22222222-2222-2222-2222-222222222222");
    other.snap = a.snap;
    expect(await other.sync()).toEqual({ status: "blocked", reason: "otherOwner" });
  });

  it("stops instead of emptying the account when the phone lost its data", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), ...Array.from({ length: 30 }, () => expense())), server);
    await a.sync();
    a.edit((s) => ({ ...s, expenses: [] }));
    expect(await a.sync()).toEqual({ status: "blocked", reason: "dataLoss" });
    expect(server.live("expenses")).toHaveLength(30);
    // Clearing on purpose goes through.
    a.snap = { ...a.snap!, expectDeletes: true };
    expect(await a.sync()).toMatchObject({ status: "ok", sent: 30 });
    expect(server.live("expenses")).toHaveLength(0);
    expect(a.snap!.expectDeletes).toBeUndefined();
  });

  it("restores everything after forgetting the snapshot", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), ...Array.from({ length: 30 }, () => expense())), server);
    await a.sync();
    a.edit((s) => ({ ...s, expenses: [] }));
    a.snap = null;
    await a.sync();
    expect(a.state.expenses).toHaveLength(30);
  });

  it("keeps old messages in the account when the phone trims them", async () => {
    const server = new FakeServer();
    const a = new Phone({ ...emptyState(), messages: Array.from({ length: MAX_MESSAGES }, () => message()) }, server);
    await a.sync();
    a.edit((s) => ({ ...s, messages: [...s.messages, message()].slice(-MAX_MESSAGES) }));
    await a.sync();
    expect(server.live("messages")).toHaveLength(MAX_MESSAGES + 1);
    expect(pendingChanges(a.state, a.snap)).toBe(0);
  });

  it("skips rows the database would reject without blocking the rest", async () => {
    const server = new FakeServer();
    const a = new Phone(withExpenses(emptyState(), expense(), expense({ amount: 0 })), server);
    expect(await a.sync()).toMatchObject({ status: "ok", skipped: 1 });
    expect(server.live("expenses")).toHaveLength(1);
    expect(pendingChanges(a.state, a.snap)).toBe(0);
  });

  it("applies payments whose card arrives in the same sync", async () => {
    const server = new FakeServer();
    const lulo = { id: "lulo", name: "Lulo", emoji: "💳", aliases: ["lulo"], credit: true };
    const payment: Payment = { id: "p1", amount: 100, toAccount: "lulo", date: "2026-09-01", createdAt: 1_790_000_000_000 };
    const a = new Phone({ ...emptyState(), settings: { ...emptyState().settings, accounts: [...emptyState().settings.accounts, lulo] }, payments: [payment] }, server);
    await a.sync();
    const b = new Phone(emptyState(), server);
    await b.sync();
    expect(b.state.payments).toEqual([payment]);
    expect(b.state.settings.accounts.map((x) => x.id)).toEqual(["efectivo", "lulo"]);
  });
});
