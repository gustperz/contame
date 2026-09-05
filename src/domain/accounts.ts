import type { Account, Settings } from "./types";

/** Only cash comes preset; the user adds their own accounts in Ajustes. */
export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "efectivo", name: "Efectivo", emoji: "💵", aliases: ["efectivo", "cash", "en plata"] },
];

export const DEFAULT_ACCOUNT_ID = "efectivo";

export function accountOf(settings: Settings, id: string | undefined): Account {
  return settings.accounts.find((a) => a.id === id) ?? settings.accounts.find((a) => a.id === settings.defaultAccount) ?? settings.accounts[0];
}

export function accountLabel(settings: Settings, id: string | undefined): string {
  const a = accountOf(settings, id);
  return `${a.emoji} ${a.name}`;
}

export function newAccountId(name: string, existing: Account[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cuenta";
  let id = base;
  let n = 2;
  while (existing.some((a) => a.id === id)) id = `${base}-${n++}`;
  return id;
}
