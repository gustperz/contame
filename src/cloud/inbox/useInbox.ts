import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxItem, InboxNotice } from "../../domain/inbox";
import { getClient } from "../client";
import { cloudConfig } from "../config";
import type { AccountState } from "../useAccount";

export type Decision = "saved" | "discarded";

/** Decisions made on this phone that the server has not recorded yet. */
export const DECISIONS_KEY = "contame:inbox:decisions";
/** How often to look for new purchases while the app is open. */
const POLL_MS = 60_000;

function loadDecisions(): Record<string, Decision> {
  try {
    const raw = JSON.parse(localStorage.getItem(DECISIONS_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveDecisions(d: Record<string, Decision>) {
  try {
    if (Object.keys(d).length) localStorage.setItem(DECISIONS_KEY, JSON.stringify(d));
    else localStorage.removeItem(DECISIONS_KEY);
  } catch {
    // Only costs a retry: the item shows up again until the server records it.
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Reads a row of inbox_items; null for anything the app could not show. */
export function fromInboxRow(r: Record<string, unknown>): InboxItem | null {
  const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
  if (typeof r.id !== "string" || !(amount > 0) || typeof r.date !== "string" || !DATE.test(r.date) || typeof r.time !== "string" || !TIME.test(r.time)) {
    return null;
  }
  const notices: InboxNotice[] = Array.isArray(r.notices)
    ? r.notices
        .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
        .map((n) => ({ kind: String(n.kind ?? ""), text: String(n.text ?? ""), receivedAt: String(n.receivedAt ?? "") }))
    : [];
  return {
    id: r.id,
    amount,
    merchant: typeof r.merchant === "string" && r.merchant.trim() ? r.merchant.trim() : "Compra",
    last4: typeof r.last4 === "string" && /^\d{4}$/.test(r.last4) ? r.last4 : null,
    date: r.date,
    time: r.time,
    credit: r.credit === true,
    notices,
  };
}

/**
 * The purchases waiting in the account's inbox. They live on the server only:
 * saving one turns it into a normal expense on the phone, which then syncs
 * like any other, and tells the server it was handled.
 */
export function useInbox(account: AccountState) {
  const userId = account.status === "signedIn" ? account.userId : null;
  const [items, setItems] = useState<InboxItem[]>([]);
  const decisions = useRef<Record<string, Decision>>(loadDecisions());
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || !cloudConfig) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    busy.current = true;
    try {
      const sb = await getClient(cloudConfig);
      // Record decisions first, so a handled purchase is not offered again.
      for (const [id, status] of Object.entries(decisions.current)) {
        const { error } = await sb.from("inbox_items").update({ status }).eq("id", id);
        if (error) throw error;
        delete decisions.current[id];
        saveDecisions(decisions.current);
      }
      const { data, error } = await sb
        .from("inbox_items")
        .select("id, amount, merchant, last4, date, time, credit, notices")
        .eq("status", "pending")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(200);
      if (error) throw error;
      const pending = (data ?? []).map(fromInboxRow).filter((x): x is InboxItem => !!x && !decisions.current[x.id]);
      setItems(pending);
    } catch (err) {
      // No signal or a server hiccup: keep showing what we had and try again later.
      console.warn("No pude revisar la bandeja", err);
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, refresh]);

  /** Takes the purchases out of the inbox here at once, and on the server as soon as it can. */
  const decide = useCallback(
    (ids: string[], status: Decision) => {
      if (!ids.length) return;
      for (const id of ids) decisions.current[id] = status;
      saveDecisions(decisions.current);
      const gone = new Set(ids);
      setItems((list) => list.filter((x) => !gone.has(x.id)));
      void refresh();
    },
    [refresh],
  );

  return { items, decide, refresh };
}

export type InboxApi = ReturnType<typeof useInbox>;
