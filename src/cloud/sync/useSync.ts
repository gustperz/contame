import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../../storage/store";
import { getClient } from "../client";
import { cloudConfig } from "../config";
import type { AccountState } from "../useAccount";
import { applyIncoming, isEmptyIncoming, type Incoming } from "./apply";
import type { Snapshot } from "./diff";
import { pendingChanges, syncOnce } from "./engine";
import { backupBeforeFirstSync, loadSnapshot, saveSnapshot } from "./storage";
import { supabaseTransport, SyncRequestError } from "./supabase";

export type SyncStatus =
  /** Not signed in, or no cloud in this build. */
  | { phase: "off" }
  | { phase: "syncing"; pending: number; lastSyncedAt: number | null }
  | { phase: "synced"; pending: number; lastSyncedAt: number }
  /** No signal: changes wait on the phone. */
  | { phase: "offline"; pending: number; lastSyncedAt: number | null; lastAttemptAt: number }
  | { phase: "error"; pending: number; lastSyncedAt: number | null; lastAttemptAt: number }
  /** Sync stopped on purpose until the person decides. */
  | { phase: "blocked"; reason: "otherOwner" | "dataLoss" };

/** How long to wait after a change before sending it, so a burst of typing goes in one trip. */
const SEND_DELAY_MS = 1500;
/** How often to look for changes made on other devices while the app is open. */
const POLL_MS = 60_000;

function isOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof SyncRequestError) return err.status === 0;
  return err instanceof TypeError;
}

/**
 * Keeps the phone's data in sync with the signed-in account. The phone stays
 * the source the app reads from; sync runs in the background when the app
 * opens, after each change, when it comes back to the foreground and when the
 * signal returns.
 */
export function useSync(state: AppState, applyRemote: (inc: Incoming) => void, account: AccountState) {
  const userId = account.status === "signedIn" ? account.userId : null;
  const stateRef = useRef(state);
  stateRef.current = state;
  const snapRef = useRef<Snapshot | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ phase: "off" });
  const running = useRef(false);
  const again = useRef(false);
  /** Set while sync waits for the person to decide; nothing runs on its own until then. */
  const blocked = useRef(false);

  const pending = () => pendingChanges(stateRef.current, snapRef.current);
  const lastSyncedAt = () => snapRef.current?.lastSyncedAt ?? null;

  const run = useCallback(async () => {
    if (!userId || !cloudConfig || blocked.current) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const current = stateRef.current;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus({ phase: "offline", pending: pending(), lastSyncedAt: lastSyncedAt(), lastAttemptAt: Date.now() });
          break;
        }
        setStatus({ phase: "syncing", pending: pending(), lastSyncedAt: lastSyncedAt() });
        try {
          if (!snapRef.current) backupBeforeFirstSync(current);
          const sb = await getClient(cloudConfig);
          const startSnap = snapRef.current;
          const res = await syncOnce(current, startSnap, userId, supabaseTransport(sb, userId));
          if (res.status === "blocked") {
            blocked.current = true;
            setStatus({ phase: "blocked", reason: res.reason });
            break;
          }
          // A clear made while this round ran still needs its deletions to go through.
          const flagged = snapRef.current !== startSnap && !!snapRef.current?.expectDeletes;
          snapRef.current = flagged ? { ...res.snapshot, expectDeletes: true } : res.snapshot;
          saveSnapshot(snapRef.current);
          if (!isEmptyIncoming(res.incoming)) applyRemote(res.incoming);
          const after = applyIncoming(stateRef.current, res.incoming);
          setStatus({ phase: "synced", pending: pendingChanges(after, snapRef.current), lastSyncedAt: res.snapshot.lastSyncedAt ?? Date.now() });
          if (res.skipped) console.warn(`Sincronización: ${res.skipped} registros no se pudieron enviar`);
        } catch (err) {
          console.warn("Sincronización fallida", err);
          const phase = isOffline(err) ? "offline" : "error";
          setStatus({ phase, pending: pending(), lastSyncedAt: lastSyncedAt(), lastAttemptAt: Date.now() });
          break;
        }
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [userId, applyRemote]);

  // Start (or stop) with the session.
  useEffect(() => {
    if (!userId) {
      setStatus({ phase: "off" });
      return;
    }
    snapRef.current = loadSnapshot();
    void run();
  }, [userId, run]);

  // Send changes shortly after they happen.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!userId) return;
    const timer = setTimeout(() => {
      const n = pending();
      if (n === 0) return;
      setStatus((s) => (s.phase === "synced" || s.phase === "offline" || s.phase === "error" ? { ...s, pending: n } : s));
      void run();
    }, SEND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, userId, run]);

  // Catch up when the app comes back, when the signal returns, and now and then while open.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => document.visibilityState === "visible" && void run();
    const onOnline = () => void run();
    const onOffline = () => setStatus({ phase: "offline", pending: pending(), lastSyncedAt: lastSyncedAt(), lastAttemptAt: Date.now() });
    const timer = setInterval(() => document.visibilityState === "visible" && void run(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [userId, run]);

  /** Call before clearing or replacing the data on purpose: the account follows. */
  const expectDeletes = useCallback(() => {
    if (!snapRef.current) return;
    snapRef.current = { ...snapRef.current, expectDeletes: true };
    saveSnapshot(snapRef.current);
  }, []);

  /**
   * Resolves a sync stopped because the phone seemed to have lost data:
   * either bring everything back from the account, or delete it there too.
   */
  const resolveDataLoss = useCallback(
    (choice: "restore" | "delete") => {
      blocked.current = false;
      if (choice === "restore") snapRef.current = null;
      else if (snapRef.current) snapRef.current = { ...snapRef.current, expectDeletes: true };
      saveSnapshot(snapRef.current);
      void run();
    },
    [run],
  );

  return { status, syncNow: run, expectDeletes, resolveDataLoss };
}

export type SyncApi = ReturnType<typeof useSync>;
