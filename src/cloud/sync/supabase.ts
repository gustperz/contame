import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transport } from "./engine";
import type { Table } from "./rows";

/** A failed request, with the HTTP status (0 when the server could not be reached). */
export class SyncRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function fail(error: { message: string }, status: number): never {
  throw new SyncRequestError(error.message, status);
}

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

/** The sync transport over Supabase's REST API, as the signed-in person. */
export function supabaseTransport(sb: SupabaseClient, userId: string): Transport {
  // Settings has one row per person; every other table is keyed by (user_id, id).
  const conflict = (t: Table) => (t === "settings" ? "user_id" : "user_id,id");
  return {
    async upsert(table, rows) {
      const { error, status } = await sb.from(table).upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: conflict(table) },
      );
      if (error) fail(error, status);
    },
    async remove(table, ids) {
      const { error, status } = await sb.from(table).update({ deleted_at: new Date().toISOString() }).in("id", ids);
      if (error) fail(error, status);
    },
    async changes(table, since) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        let query = sb.from(table).select("*");
        if (since) query = query.gte("updated_at", since);
        const { data, error, status } = await query
          .order("updated_at")
          .order(table === "settings" ? "user_id" : "id")
          .range(from, from + PAGE - 1);
        if (error) fail(error, status);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) return rows;
      }
    },
  };
}
