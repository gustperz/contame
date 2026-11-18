import type { Account, Settings } from "./types";

/** Someone in a shared space, as the app names them. */
export interface Member {
  id: string;
  name: string;
}

/**
 * Who is using the app and with whom. Two people can keep one set of expenses:
 * everything lives in the owner's space, and each row says who wrote it.
 * Alone or signed out, `me` and `owner` are the same (or null) and nothing
 * here changes what the app shows.
 */
export interface People {
  /** The signed-in person; null when signed out. */
  me: string | null;
  /** Whose space this is; rows without an author are theirs. */
  owner: string | null;
  members: Member[];
}

export const ALONE: People = { me: null, owner: null, members: [] };

export function isShared(p: People): boolean {
  return p.members.length > 1;
}

/** Who wrote a row or owns an account: the one it names, or the owner of the space. */
export function personOf(x: { by?: string; owner?: string }, p: People): string | null {
  return x.by ?? x.owner ?? p.owner;
}

/** True for what the signed-in person wrote or owns; everything, when not sharing. */
export function isMine(x: { by?: string; owner?: string }, p: People): boolean {
  return !isShared(p) || personOf(x, p) === p.me;
}

export function memberName(id: string | null, p: People): string {
  return p.members.find((m) => m.id === id)?.name ?? "Otra persona";
}

/** The name to show next to something another person wrote; nothing for one's own. */
export function otherName(x: { by?: string; owner?: string }, p: People): string | undefined {
  return isMine(x, p) ? undefined : memberName(personOf(x, p), p);
}

export function accountsOf(settings: Settings, who: string | null, p: People): Account[] {
  return isShared(p) ? settings.accounts.filter((a) => personOf(a, p) === who) : settings.accounts;
}

export function defaultAccountOf(settings: Settings, who: string | null, p: People): string | undefined {
  if (!isShared(p) || who === p.owner) return settings.defaultAccount;
  return who ? settings.memberDefaults?.[who] : undefined;
}

/**
 * The settings as one person uses them to write: only their accounts and
 * their own default. Each person keeps their accounts apart, while expenses
 * are shared.
 */
export function settingsOf(settings: Settings, who: string | null, p: People): Settings {
  if (!isShared(p)) return settings;
  return { ...settings, accounts: accountsOf(settings, who, p), defaultAccount: defaultAccountOf(settings, who, p) };
}

/**
 * The whole account list and defaults after the signed-in person edited
 * theirs: the other people's accounts are kept as they were, in place.
 */
export function withMyAccounts(settings: Settings, mine: Account[], myDefault: string | undefined, p: People): Pick<Settings, "accounts" | "defaultAccount" | "memberDefaults"> {
  if (!isShared(p) || !p.me) return { accounts: mine, defaultAccount: myDefault, memberDefaults: settings.memberDefaults };
  const me = p.me;
  const others = settings.accounts.filter((a) => personOf(a, p) !== me);
  const tagged = mine.map((a) => (me === p.owner ? a : { ...a, owner: me }));
  if (me === p.owner) return { accounts: [...tagged, ...others], defaultAccount: myDefault, memberDefaults: settings.memberDefaults };
  const { [me]: _, ...rest } = settings.memberDefaults ?? {};
  const memberDefaults = myDefault ? { ...rest, [me]: myDefault } : rest;
  return { accounts: [...others, ...tagged], defaultAccount: settings.defaultAccount, memberDefaults: Object.keys(memberDefaults).length ? memberDefaults : undefined };
}
