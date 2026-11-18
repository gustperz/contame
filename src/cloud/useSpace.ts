import { useEffect, useMemo, useState } from "react";
import type { Member, People } from "../domain/people";
import { ALONE } from "../domain/people";
import { getClient } from "./client";
import { cloudConfig } from "./config";
import type { AccountState } from "./useAccount";

/** The space the signed-in person works in, and the people in it. */
export interface Space {
  /** Whose rows the phone syncs: the person's own id, or the owner's when they are a member. */
  spaceId: string;
  members: Member[];
}

const KEY = "contame:space";

type Stored = { userId: string } & Space;

function readStored(userId: string): Space | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    return s && s.userId === userId && typeof s.spaceId === "string" && Array.isArray(s.members) ? { spaceId: s.spaceId, members: s.members } : null;
  } catch {
    return null;
  }
}

/** What the members table says about a person: their space and who is in it. */
export function spaceFrom(userId: string, rows: Array<{ user_id?: unknown; space_id?: unknown; name?: unknown }>): Space {
  const valid = rows.filter((r): r is { user_id: string; space_id: string; name: string } => typeof r.user_id === "string" && typeof r.space_id === "string" && typeof r.name === "string");
  const mine = valid.find((r) => r.user_id === userId);
  if (!mine) return { spaceId: userId, members: [] };
  return {
    spaceId: mine.space_id,
    members: valid.filter((r) => r.space_id === mine.space_id).map((r) => ({ id: r.user_id, name: r.name })),
  };
}

/**
 * Finds out which space the person works in before anything syncs. The answer
 * is remembered on the phone, so the app opens offline with the same space;
 * the first time, sync waits for it (`space` is null) rather than guessing
 * and writing the person's expenses somewhere they do not belong.
 */
export function useSpace(account: AccountState): { space: Space | null; people: People } {
  const userId = account.status === "signedIn" ? account.userId : null;
  const [space, setSpace] = useState<Space | null>(() => (userId ? readStored(userId) : null));

  useEffect(() => {
    if (!userId || !cloudConfig) {
      setSpace(null);
      return;
    }
    setSpace(readStored(userId));
    let alive = true;
    const load = async () => {
      try {
        const sb = await getClient(cloudConfig!);
        const { data, error } = await sb.from("members").select("user_id, space_id, name").order("created_at");
        if (error || !alive) return;
        const next = spaceFrom(userId, data ?? []);
        try {
          localStorage.setItem(KEY, JSON.stringify({ userId, ...next } satisfies Stored));
        } catch {
          // Not remembered: asked again next time.
        }
        setSpace((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch {
        // No signal: keep what the phone remembers and try again when it returns.
      }
    };
    void load();
    const onOnline = () => void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const people = useMemo<People>(() => (userId && space ? { me: userId, owner: space.spaceId, members: space.members } : ALONE), [userId, space]);
  return { space: userId ? space : null, people };
}
