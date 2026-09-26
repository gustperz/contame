import type { AppState } from "../../storage/store";
import { applyIncoming, emptyIncoming, type Incoming } from "./apply";
import { countOutgoing, emptySnapshot, looksLikeDataLoss, outgoing, type Snapshot } from "./diff";
import { fromRemote, toRemote, type RemoteRow } from "./remote";
import { hashRow, rowsOf, TABLES, type Row, type Table } from "./rows";

/** How the engine talks to the server. The real one is Supabase; tests use a fake. */
export interface Transport {
  /** Creates or replaces rows (and brings back soft-deleted ones). */
  upsert(table: Table, rows: RemoteRow[]): Promise<void>;
  /** Marks rows as deleted, so other phones remove them too. */
  remove(table: Table, ids: string[]): Promise<void>;
  /** Every row changed at or after `since` (everything when null), oldest first. */
  changes(table: Table, since: string | null): Promise<RemoteRow[]>;
}

export type SyncResult =
  | { status: "ok"; snapshot: Snapshot; incoming: Incoming; sent: number; skipped: number }
  | { status: "blocked"; reason: "otherOwner" | "dataLoss" };

/**
 * Server clocks are shared, but a change can commit a moment after a later one
 * was read. Asking again for a small window before the cursor catches it; rows
 * seen twice compare equal and cost nothing.
 */
const CURSOR_OVERLAP_MS = 5000;

function since(cursor: string | undefined): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  return Number.isNaN(t) ? null : new Date(t - CURSOR_OVERLAP_MS).toISOString();
}

const later = (a: string | undefined, b: string) => (!a || Date.parse(b) > Date.parse(a) ? b : a);

/**
 * One round of sync: download what changed, merge it with the phone's copy,
 * then upload what the phone changed.
 *
 * Conflicts are rare with one person on a few phones, and resolved per row:
 * a row edited on this phone since the last sync keeps this phone's version;
 * otherwise the server's version wins. On the very first sync the server wins
 * for rows that exist on both sides (the fixed account ids and the settings),
 * so a new phone does not overwrite the setup of the old one.
 *
 * Returns the changes to apply to the app and the new snapshot, or throws when
 * the server cannot be reached, leaving the snapshot as it was.
 */
export async function syncOnce(state: AppState, prev: Snapshot | null, userId: string, transport: Transport): Promise<SyncResult> {
  if (prev && prev.owner !== userId) return { status: "blocked", reason: "otherOwner" };
  const snap: Snapshot = structuredClone(prev ?? emptySnapshot(userId));
  const firstSync = snap.lastSyncedAt === null;
  const local = rowsOf(state);
  const incoming = emptyIncoming();

  // 1. Download.
  for (const table of TABLES) {
    const known = snap.hashes[table];
    for (const raw of await transport.changes(table, since(snap.cursors[table]))) {
      const change = fromRemote(table, raw);
      if (!change) continue;
      if (change.updatedAt) snap.cursors[table] = later(snap.cursors[table], change.updatedAt);
      const id = change.deleted ? change.id : change.row.id;
      const mine = local[table].get(id);
      // Changed on this phone, or deleted on it (known but gone).
      const dirty = mine !== undefined ? known[id] !== hashRow(mine) : known[id] !== undefined;
      if (dirty && !firstSync) continue;
      if (change.deleted) {
        delete known[id];
        delete snap.messageTimes[id];
        if (mine) incoming.deletes[table].push(id);
        continue;
      }
      const hash = hashRow(change.row);
      known[id] = hash;
      if (table === "messages") snap.messageTimes[id] = change.row.createdAt as number;
      if (!mine || hashRow(mine) !== hash) incoming.upserts[table].push(change.row);
    }
  }

  // 2. Upload what the merged copy has that the server does not.
  const merged = rowsOf(applyIncoming(state, incoming));
  const out = outgoing(merged, snap);
  if (looksLikeDataLoss(out, snap)) return { status: "blocked", reason: "dataLoss" };
  let skipped = 0;
  for (const table of TABLES) {
    const valid: Array<{ row: Row; remote: RemoteRow }> = [];
    for (const row of out.upserts[table]) {
      const remote = toRemote(table, row);
      if (remote) valid.push({ row, remote });
      else skipped++;
    }
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      await transport.upsert(table, chunk.map((v) => v.remote));
      for (const { row } of chunk) {
        snap.hashes[table][row.id] = hashRow(row);
        if (table === "messages") snap.messageTimes[row.id] = row.createdAt as number;
      }
    }
    const gone = out.deletes[table];
    for (let i = 0; i < gone.length; i += 100) {
      const chunk = gone.slice(i, i + 100);
      await transport.remove(table, chunk);
      for (const id of chunk) {
        delete snap.hashes[table][id];
        delete snap.messageTimes[id];
      }
    }
  }
  for (const id of out.trimmed) {
    delete snap.hashes.messages[id];
    delete snap.messageTimes[id];
  }

  snap.lastSyncedAt = Date.now();
  delete snap.expectDeletes;
  return { status: "ok", snapshot: snap, incoming, sent: countOutgoing(out) - skipped, skipped };
}

/**
 * Changes on the phone the server has not received yet, as a person would
 * count them: an expense and the chat line that created it are one change.
 * Rows the server would reject are not counted.
 */
export function pendingChanges(state: AppState, snap: Snapshot | null): number {
  if (!snap) return 0;
  const out = outgoing(rowsOf(state), snap);
  const count = (t: Table) => out.upserts[t].filter((r) => toRemote(t, r)).length + out.deletes[t].length;
  const data = TABLES.filter((t) => t !== "messages").reduce((n, t) => n + count(t), 0);
  return data || count("messages");
}
