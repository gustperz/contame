import { MAX_MESSAGES } from "../../storage/store";
import { hashRow, TABLES, type Row, type RowsByTable, type Table } from "./rows";

/**
 * What this phone last agreed on with the server, kept next to the data.
 * A row whose hash differs from the one here was changed on the phone; a row
 * listed here but gone from the phone was deleted on the phone.
 */
export interface Snapshot {
  /** The account this phone syncs with. Data never moves to a different one. */
  owner: string;
  hashes: Record<Table, Record<string, string>>;
  /** When each synced message was written, to tell a trimmed message from a deleted one. */
  messageTimes: Record<string, number>;
  /** The latest server change seen, per table. */
  cursors: Partial<Record<Table, string>>;
  lastSyncedAt: number | null;
  /** Set when the person cleared or replaced their data on purpose, so a big deletion is expected. */
  expectDeletes?: boolean;
}

export function emptySnapshot(owner: string): Snapshot {
  return { owner, hashes: { accounts: {}, settings: {}, expenses: {}, payments: {}, messages: {} }, messageTimes: {}, cursors: {}, lastSyncedAt: null };
}

export interface Outgoing {
  upserts: Record<Table, Row[]>;
  deletes: Record<Table, string[]>;
  /** Messages the phone let go of to save space. They stay in the account. */
  trimmed: string[];
}

const perTable = <T,>(make: () => T): Record<Table, T> =>
  Object.fromEntries(TABLES.map((t) => [t, make()])) as Record<Table, T>;

/** Everything the phone has that the server does not know about yet. */
export function outgoing(local: RowsByTable, snap: Snapshot): Outgoing {
  const upserts = perTable<Row[]>(() => []);
  const deletes = perTable<string[]>(() => []);
  const trimmed: string[] = [];
  let oldestMessage = Infinity;
  for (const m of local.messages.values()) oldestMessage = Math.min(oldestMessage, m.createdAt as number);
  const phoneIsFull = local.messages.size >= MAX_MESSAGES;

  for (const table of TABLES) {
    const known = snap.hashes[table];
    for (const [id, row] of local[table]) {
      if (known[id] !== hashRow(row)) upserts[table].push(row);
    }
    // The settings row is never deleted, only changed.
    if (table === "settings") continue;
    for (const id of Object.keys(known)) {
      if (local[table].has(id)) continue;
      const time = snap.messageTimes[id];
      if (table === "messages" && phoneIsFull && time !== undefined && time < oldestMessage) trimmed.push(id);
      else deletes[table].push(id);
    }
  }
  return { upserts, deletes, trimmed };
}

/** How many changes are waiting to be sent. */
export function countOutgoing(o: Outgoing): number {
  return TABLES.reduce((n, t) => n + o.upserts[t].length + o.deletes[t].length, 0);
}

/**
 * True when the phone is about to delete most of what it had synced without
 * the person asking for it, which is what a wiped or unreadable local copy
 * looks like. Sync stops instead of emptying the account.
 */
export function looksLikeDataLoss(o: Outgoing, snap: Snapshot): boolean {
  if (snap.expectDeletes) return false;
  return (["expenses", "payments", "messages"] as const).some((t) => {
    const known = Object.keys(snap.hashes[t]).length;
    const gone = o.deletes[t].length;
    return gone >= 20 && gone > known / 2;
  });
}
