import { useEffect, useRef, useState } from "react";
import type { CategoryId, Settings } from "../domain/types";
import { CATEGORIES } from "../domain/categories";
import { byPurchaseTime, noticeName, proposeMerge, type InboxItem, type Proposal } from "../domain/inbox";
import type { InboxEntry } from "../storage/useApp";
import { formatMoney } from "../utils/money";
import { humanDate } from "../utils/dates";
import { clock } from "./InboxSheet";
import { Sheet } from "./Sheet";

interface Props {
  /** The purchases to join; null keeps the sheet closed. */
  items: InboxItem[] | null;
  proposals: Map<string, Proposal>;
  settings: Settings;
  currency: string;
  onClose: () => void;
  onSave: (entry: InboxEntry) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Several purchases of the inbox saved as a single expense; the amount is their sum. */
export function MergeSheet({ items, proposals, settings, currency, onClose, onSave }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [account, setAccount] = useState("");

  // Filled once per opening, so a sync while editing does not overwrite what was typed.
  const filledFor = useRef<string | null>(null);
  const key = items?.map((i) => i.id).join("|") ?? null;
  useEffect(() => {
    if (!items || !key) {
      filledFor.current = null;
      return;
    }
    if (filledFor.current === key) return;
    filledFor.current = key;
    const p = proposeMerge(items, proposals);
    setDescription(p.description);
    setCategory(p.category);
    setAccount(p.account ?? "");
  }, [key, items, proposals]);

  if (!items || items.length < 2) return null;
  const sorted = byPurchaseTime(items);
  const [first, ...rest] = sorted;
  const last = sorted[sorted.length - 1];
  const { amount, accountsDiffer } = proposeMerge(items, proposals);
  const money = (n: number) => formatMoney(n, currency);

  return (
    <Sheet title={`Unir ${items.length} movimientos`} open onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ item: first, merged: rest, choice: { description: description.trim() || first.merchant, amount, category, account: account || undefined } });
          onClose();
        }}
      >
        <div className="merge-list">
          <ul className="merge-list__items">
            {sorted.map((i) => (
              <li key={i.id} className="merge-item">
                <span className="expense__text">
                  <span className="expense__desc">{i.merchant}</span>
                  <span className="expense__meta">
                    {cap(humanDate(i.date))} {clock(i.time)}
                    {i.notices[0] ? ` · ${noticeName(i.notices[0].kind)}` : ""}
                  </span>
                </span>
                <span className="merge-item__amount">{money(i.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="merge-list__total">
            <span>Total</span>
            <strong>{money(amount)}</strong>
          </div>
        </div>
        <label className="field">
          <span>Descripción</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Cuenta</span>
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Sin cuenta</option>
              {settings.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Fecha</span>
            <span className="field__static">{cap(humanDate(last.date))}</span>
          </div>
        </div>
        {accountsDiffer && <p className="field__hint merge-warning">Vienen de cuentas distintas: el gasto queda en la que elijas.</p>}
        <p className="hint">Se guardan como un solo gasto, con la fecha del último. Los avisos de los {items.length} quedan en él y los ves al editarlo.</p>
        <div className="merge-actions">
          <button type="submit" className="btn btn--primary btn--block">
            Guardar 1 gasto · {money(amount)}
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
