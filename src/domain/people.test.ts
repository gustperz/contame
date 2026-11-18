import { describe, expect, it } from "vitest";
import { accountsOf, ALONE, isMine, otherName, settingsOf, withMyAccounts, type People } from "./people";
import type { Settings } from "./types";
import { spaceFrom } from "../cloud/useSpace";
import { emptyState, sanitize } from "../storage/store";
import { saveInbox } from "../storage/useApp";

const GUS = "11111111-1111-4111-8111-111111111111";
const MALU = "22222222-2222-4222-8222-222222222222";
const members = [
  { id: GUS, name: "Gustavo" },
  { id: MALU, name: "Maria Luisa" },
];
const asGus: People = { me: GUS, owner: GUS, members };
const asMalu: People = { me: MALU, owner: GUS, members };
const settings: Settings = {
  currency: "COP",
  defaultAccount: "nequi",
  memberDefaults: { [MALU]: "nequi-2" },
  accounts: [
    { id: "efectivo", name: "Efectivo", emoji: "💵", aliases: [] },
    { id: "nequi", name: "Nequi", emoji: "💜", aliases: ["nequi"] },
    { id: "nequi-2", name: "Nequi", emoji: "🧡", aliases: ["nequi"], owner: MALU },
  ],
};

describe("two people sharing one set of expenses", () => {
  it("reads the space and its people from the members table", () => {
    const rows = [
      { user_id: GUS, space_id: GUS, name: "Gustavo" },
      { user_id: MALU, space_id: GUS, name: "Maria Luisa" },
    ];
    expect(spaceFrom(MALU, rows)).toEqual({ spaceId: GUS, members });
    expect(spaceFrom(GUS, rows).spaceId).toBe(GUS);
    expect(spaceFrom("someone-else", [])).toEqual({ spaceId: "someone-else", members: [] });
  });

  it("treats rows without an author as the owner's", () => {
    expect(isMine({}, asGus)).toBe(true);
    expect(isMine({}, asMalu)).toBe(false);
    expect(isMine({ by: MALU }, asMalu)).toBe(true);
    expect(otherName({ by: MALU }, asGus)).toBe("Maria Luisa");
    expect(otherName({}, asMalu)).toBe("Gustavo");
    expect(otherName({ by: MALU }, asMalu)).toBeUndefined();
  });

  it("changes nothing for someone who shares with nobody", () => {
    const alone: People = { me: GUS, owner: GUS, members: [members[0]] };
    expect(isMine({ by: MALU }, alone)).toBe(true);
    expect(settingsOf(settings, GUS, alone)).toBe(settings);
    expect(settingsOf(settings, null, ALONE)).toBe(settings);
  });

  it("gives each person only their accounts and their own default", () => {
    expect(accountsOf(settings, GUS, asGus).map((a) => a.id)).toEqual(["efectivo", "nequi"]);
    expect(settingsOf(settings, MALU, asMalu)).toMatchObject({ defaultAccount: "nequi-2", accounts: [{ id: "nequi-2" }] });
    expect(settingsOf(settings, GUS, asMalu).defaultAccount).toBe("nequi");
  });

  it("keeps the other person's accounts when one edits theirs", () => {
    const hers = [...accountsOf(settings, MALU, asMalu), { id: "davivienda", name: "Davivienda", emoji: "🏦", aliases: [] }];
    const next = withMyAccounts(settings, hers, "davivienda", asMalu);
    expect(next.accounts.map((a) => [a.id, a.owner])).toEqual([["efectivo", undefined], ["nequi", undefined], ["nequi-2", MALU], ["davivienda", MALU]]);
    expect(next.defaultAccount).toBe("nequi");
    expect(next.memberDefaults).toEqual({ [MALU]: "davivienda" });

    const his = withMyAccounts(settings, [settings.accounts[1]], undefined, asGus);
    expect(his.accounts.map((a) => a.id)).toEqual(["nequi", "nequi-2"]);
    expect(his.defaultAccount).toBeUndefined();
    expect(his.memberDefaults).toEqual({ [MALU]: "nequi-2" });
  });

  it("drops a member's default when its account is gone", () => {
    const state = sanitize({ ...emptyState(), settings: { ...settings, accounts: settings.accounts.slice(0, 2) } });
    expect(state.settings.memberDefaults).toBeUndefined();
    expect(sanitize({ ...emptyState(), settings }).settings).toMatchObject({ memberDefaults: { [MALU]: "nequi-2" }, accounts: [{}, {}, { owner: MALU }] });
  });

  it("keeps who wrote each chat line when the data is cleaned", () => {
    const state = sanitize({ ...emptyState(), version: 5, messages: [{ id: "m1", text: "cuánto llevo", createdAt: 5, kind: "query", note: "…", by: MALU }] });
    expect(state.messages[0].by).toBe(MALU);
  });

  it("signs what is saved from the inbox", () => {
    const item = { id: "x|1", amount: 9000, merchant: "Tienda", last4: null, date: "2026-11-18", time: "10:00", credit: false, notices: [] };
    const next = saveInbox(sanitize({ ...emptyState(), settings }), [{ item, choice: { description: "Tienda", amount: 9000, category: "otros", account: "nequi-2" } }], 5, MALU);
    expect(next.expenses[0]).toMatchObject({ by: MALU, account: "nequi-2" });
    expect(next.messages.at(-1)?.by).toBe(MALU);
  });
});
