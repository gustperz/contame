import { useEffect, useMemo, useState } from "react";
import type { CategoryId, Expense, Settings } from "../domain/types";
import { CATEGORIES, categoryOf } from "../domain/categories";
import { accountLabel } from "../domain/accounts";
import { accountsDiffer, joinCandidates, type JoinChoice } from "../domain/merge";
import { formatMoney } from "../utils/money";
import { humanDate } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  /** The expense opened to join others into; null keeps the sheet closed. */
  expense: Expense | null;
  /** The saved expenses it can be joined with (the person's own). */
  expenses: Expense[];
  /** The accounts of whoever wrote the expense. */
  settings: Settings;
  currency: string;
  onJoin: (keepId: string, otherIds: string[], choice: JoinChoice) => void;
  onClose: () => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Joins saved expenses into one, in two steps: pick which ones (those of
 * nearby days first, or any by searching), then confirm the result.
 */
export function JoinExpensesSheet({ expense, expenses, settings, currency, onJoin, onClose }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [account, setAccount] = useState("");

  const id = expense?.id ?? null;
  useEffect(() => {
    setPicked(new Set());
    setSearch("");
    setConfirming(false);
    if (!expense) return;
    setDescription(expense.description);
    setCategory(expense.category);
    setAccount(expense.account ?? "");
  }, [id]);

  const candidates = useMemo(() => (expense ? joinCandidates(expense, expenses, search) : []), [expense, expenses, search]);
  if (!expense) return null;

  const money = (n: number) => formatMoney(n, currency);
  const others = expenses.filter((e) => picked.has(e.id));
  const all = [expense, ...others];
  const total = all.reduce((n, e) => n + e.amount, 0);
  const toggle = (eid: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  // Ticked ones stay in sight even when the search no longer matches them.
  const shown = [...others.filter((o) => !candidates.some((c) => c.id === o.id)), ...candidates];
  let lastDay = "";

  if (confirming && others.length > 0) {
    const movements = all.reduce((n, e) => n + (e.parts && e.parts > 1 ? e.parts : 1), 0);
    const latest = all.reduce((a, b) => (b.date > a.date ? b : a));
    return (
      <Sheet title={`Unir ${all.length} gastos`} open onClose={onClose}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            onJoin(expense.id, others.map((o) => o.id), { description, category, account: account || undefined });
            onClose();
          }}
        >
          <div className="merge-list">
            <ul className="merge-list__items">
              {all.map((e) => (
                <li key={e.id} className="merge-item">
                  <span className="expense__text">
                    <span className="expense__desc">{e.description}</span>
                    <span className="expense__meta">
                      {cap(humanDate(e.date))} · {accountLabel(settings, e.account)}
                    </span>
                  </span>
                  <span className="merge-item__amount">{money(e.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="merge-list__total">
              <span>Total</span>
              <strong>{money(total)}</strong>
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
              <span className="field__static">{cap(humanDate(latest.date))}</span>
            </div>
          </div>
          {accountsDiffer(all) && <p className="field__hint merge-warning">Vienen de cuentas distintas: el gasto queda en la que elijas.</p>}
          <p className="hint">
            Queda un solo gasto de {money(total)} con la etiqueta «{movements} movimientos». {others.length === 1 ? `«${others[0].description}» desaparece` : "Los demás desaparecen"} del chat; lo que decía cada uno se guarda y lo ves al editar.
          </p>
          <div className="merge-actions">
            <button type="submit" className="btn btn--primary btn--block">
              Unir en 1 gasto · {money(total)}
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setConfirming(false)}>
              Volver
            </button>
          </div>
        </form>
      </Sheet>
    );
  }

  const baseCat = categoryOf(expense.category);
  return (
    <Sheet title="Unir con…" open onClose={onClose} fill>
      <div className="inbox join">
        <div className="join__base">
          <span className="expense__emoji" aria-hidden>
            {baseCat.emoji}
          </span>
          <span className="expense__text">
            <span className="expense__desc">{expense.description}</span>
            <span className="expense__meta">
              {cap(humanDate(expense.date))} · {baseCat.name} · {accountLabel(settings, expense.account)}
            </span>
          </span>
          <span className="expense__amount">{money(expense.amount)}</span>
        </div>
        <input className="join__search" type="search" aria-label="Buscar un gasto" placeholder="Buscar por nombre o monto" value={search} onChange={(e) => setSearch(e.target.value)} />
        {shown.length === 0 ? (
          <p className="empty">{search.trim() ? "Ningún gasto coincide." : "No hay otros gastos de fechas cercanas. Busca por nombre o monto."}</p>
        ) : (
          <ul className="list inbox__list">
            {shown.map((e) => {
              const cat = categoryOf(e.category);
              const day = e.date !== lastDay ? <li className="list__day">{cap(humanDate(e.date))}{e.date === expense.date && <span className="join__same"> · el mismo día</span>}</li> : null;
              lastDay = e.date;
              const checked = picked.has(e.id);
              return (
                <li key={e.id} className="list__item-wrap">
                  {day}
                  <label className={`inbox-row join__row ${checked ? "join__row--picked" : ""}`}>
                    <span className="inbox-row__check">
                      <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} />
                    </span>
                    <span className="inbox-row__main">
                      <span className="expense__emoji" aria-hidden>
                        {cat.emoji}
                      </span>
                      <span className="expense__text">
                        <span className="expense__desc">{e.description}</span>
                        <span className="expense__meta">
                          {cat.name} · {accountLabel(settings, e.account)}
                        </span>
                      </span>
                      <span className="expense__amount">{money(e.amount)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="inbox__footer">
          <button className="btn btn--primary btn--block" disabled={others.length === 0} onClick={() => setConfirming(true)}>
            {others.length === 0 ? "Marca con cuál unirlo" : `Unir ${all.length} gastos · ${money(total)}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
