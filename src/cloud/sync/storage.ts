import type { AppState } from "../../storage/store";
import type { Snapshot } from "./diff";

export const SNAPSHOT_KEY = "contame:sync";
/** A copy of the phone's data taken right before it first syncs, in case anything goes wrong. */
export const BACKUP_KEY = "contame:backup:antes-de-sincronizar";

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    return s && typeof s.owner === "string" && s.hashes ? s : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(s: Snapshot | null): void {
  try {
    if (s) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
    else localStorage.removeItem(SNAPSHOT_KEY);
  } catch (err) {
    console.warn("No se pudo guardar el estado de sincronización", err);
  }
}

/** Keeps the first backup only: later syncs never replace it. */
export function backupBeforeFirstSync(state: AppState): void {
  try {
    if (localStorage.getItem(BACKUP_KEY)) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), state }));
  } catch (err) {
    console.warn("No se pudo guardar el respaldo previo", err);
  }
}
