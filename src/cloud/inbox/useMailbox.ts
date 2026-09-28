import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import { cloudConfig } from "../config";
import type { AccountState } from "../useAccount";

/** One daily review of the email, written by the scheduled Claude routine. */
export interface ReviewRun {
  ranAt: string;
  /** The day whose email was reviewed (YYYY-MM-DD). */
  day: string;
  emailsSeen: number;
  paymentsAdded: number;
  note: string | null;
}

export interface UnmatchedMessage {
  id: number;
  receivedAt: string;
  sender: string | null;
  subject: string | null;
  body: string;
}

export type MailboxState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lastRun: ReviewRun | null; unmatched: UnmatchedMessage[] };

/** The state of the daily email review for the signed-in account, loaded while `active`. */
export function useMailbox(account: AccountState, active: boolean) {
  const userId = account.status === "signedIn" ? account.userId : null;
  const [state, setState] = useState<MailboxState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!userId || !cloudConfig) return;
    try {
      const sb = await getClient(cloudConfig);
      const [runs, unmatched] = await Promise.all([
        sb.from("inbox_runs").select("ran_at, day, emails_seen, payments_added, note").order("ran_at", { ascending: false }).limit(1),
        sb.from("inbox_unmatched").select("id, received_at, sender, subject, body").order("received_at", { ascending: false }).limit(10),
      ]);
      const error = runs.error ?? unmatched.error;
      if (error) throw error;
      const r = runs.data?.[0];
      setState({
        status: "ready",
        lastRun: r ? { ranAt: r.ran_at, day: r.day, emailsSeen: r.emails_seen, paymentsAdded: r.payments_added, note: r.note } : null,
        unmatched: (unmatched.data ?? []).map((m) => ({ id: m.id, receivedAt: m.received_at, sender: m.sender, subject: m.subject, body: m.body })),
      });
    } catch (err) {
      console.warn("No pude leer la bandeja automática", err);
      setState({ status: "error", message: "No pude conectarme. Revisa la señal y vuelve a intentar." });
    }
  }, [userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const dismiss = useCallback(
    async (id: number) => {
      if (!cloudConfig) return;
      const sb = await getClient(cloudConfig);
      await sb.from("inbox_unmatched").delete().eq("id", id);
      await load();
    },
    [load],
  );

  return { state, reload: load, dismiss };
}
