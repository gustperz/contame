import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import { cloudConfig } from "../config";
import type { AccountState } from "../useAccount";

export interface MailboxKey {
  createdAt: string;
  lastUsedAt: string | null;
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
  | { status: "ready"; key: MailboxKey | null; unmatched: UnmatchedMessage[]; lastNoticeAt: string | null };

/** A new mailbox key: 32 random bytes, URL-safe, recognisable by its prefix. */
export function newMailboxKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `ctm_${b64}`;
}

/** SHA-256 in hex: what the database keeps instead of the key. */
export async function fingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The Apps Script files, with this project's settings and the given mailbox key. */
export async function mailboxFiles(token: string): Promise<{ code: string; manifest: string }> {
  if (!cloudConfig) throw new Error("Esta versión no tiene cuenta configurada.");
  const [{ default: parts }, { assembleScript }] = await Promise.all([import("virtual:mailbox-code"), import("../../../inbox/apps-script/assemble")]);
  return { code: assembleScript(parts, { url: cloudConfig.url, key: cloudConfig.key, token }), manifest: parts.manifest };
}

/** The mailbox settings of the signed-in account, loaded while `active`. */
export function useMailbox(account: AccountState, active: boolean) {
  const userId = account.status === "signedIn" ? account.userId : null;
  const [state, setState] = useState<MailboxState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!userId || !cloudConfig) return;
    try {
      const sb = await getClient(cloudConfig);
      const [key, unmatched, last] = await Promise.all([
        sb.from("inbox_tokens").select("created_at, last_used_at").maybeSingle(),
        sb.from("inbox_unmatched").select("id, received_at, sender, subject, body").order("received_at", { ascending: false }).limit(10),
        sb.from("inbox_items").select("created_at").order("created_at", { ascending: false }).limit(1),
      ]);
      const error = key.error ?? unmatched.error ?? last.error;
      if (error) throw error;
      setState({
        status: "ready",
        key: key.data ? { createdAt: key.data.created_at, lastUsedAt: key.data.last_used_at } : null,
        unmatched: (unmatched.data ?? []).map((m) => ({ id: m.id, receivedAt: m.received_at, sender: m.sender, subject: m.subject, body: m.body })),
        lastNoticeAt: last.data?.[0]?.created_at ?? null,
      });
    } catch (err) {
      console.warn("No pude leer la bandeja automática", err);
      setState({ status: "error", message: "No pude conectarme. Revisa la señal y vuelve a intentar." });
    }
  }, [userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  /** Creates (or replaces) the key and returns it; only its fingerprint is stored. */
  const createKey = useCallback(async (): Promise<string> => {
    if (!userId || !cloudConfig) throw new Error("Entra con tu cuenta primero.");
    const key = newMailboxKey();
    const sb = await getClient(cloudConfig);
    const { error } = await sb
      .from("inbox_tokens")
      .upsert({ user_id: userId, token_hash: await fingerprint(key), created_at: new Date().toISOString(), last_used_at: null }, { onConflict: "user_id" });
    if (error) throw error;
    await load();
    return key;
  }, [userId, load]);

  const dismiss = useCallback(
    async (id: number) => {
      if (!cloudConfig) return;
      const sb = await getClient(cloudConfig);
      await sb.from("inbox_unmatched").delete().eq("id", id);
      await load();
    },
    [load],
  );

  return { state, reload: load, createKey, dismiss };
}
