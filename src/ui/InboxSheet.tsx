import { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryId, Expense, Settings } from "../domain/types";
import { CATEGORIES, categoryOf } from "../domain/categories";
import { accountOf } from "../domain/accounts";
import { merchantKey, needsReview, noticeName, propose, reviewSummary, type InboxItem, type Proposal } from "../domain/inbox";
import type { InboxEntry } from "../storage/useApp";
import { formatMoney } from "../utils/money";
import { fromISODate, humanDate, toISODate, addDays } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  items: InboxItem[];
  settings: Settings;
  expenses: Expense[];
  currency: string;
  onSave: (entries: InboxEntry[]) => void;
  onDiscard: (item: InboxItem) => void;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "6:01 p.m." from "18:01". */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "a.m." : "p.m.";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "desde el jueves" for the last week, "desde el 12 sep" before that. */
function since(date: string, now: Date): string {
  const d = fromISODate(date);
  if (date === toISODate(now)) return "de hoy";
  if (date === toISODate(addDays(now, -1))) return "desde ayer";
  if (d > addDays(now, -7)) return `desde el ${WEEKDAYS[d.getDay()]}`;
  return `desde el ${humanDate(date, now).replace(/^\S+\s/, "").toLowerCase()}`;
}

function accountText(settings: Settings, id: string | undefined) {
  const a = accountOf(settings, id);
  return a ? `${a.emoji} ${a.name}` : "sin cuenta";
}

/** The list of new purchases, all ticked except the ones that look already noted. */
export function InboxSheet({ open, onClose, items, settings, expenses, currency, onSave, onDiscard }: Props) {
  const now = new Date();
  const proposals = useMemo(() => new Map(items.map((i) => [i.id, propose(i, settings, expenses)])), [items, settings, expenses]);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<InboxItem | null>(null);
  const seen = useRef(new Set<string>());

  // Purchases that look already noted start unticked; the person can still tick them.
  useEffect(() => {
    const fresh = [...proposals].filter(([id]) => !seen.current.has(id));
    for (const [id] of fresh) seen.current.add(id);
    const doubtful = fresh.filter(([, p]) => p.duplicate).map(([id]) => id);
    if (doubtful.length) setUnticked((s) => new Set([...s, ...doubtful]));
  }, [proposals]);

  const ticked = items.filter((i) => !unticked.has(i.id));
  const total = ticked.reduce((n, i) => n + i.amount, 0);
  const allTicked = ticked.length === items.length;
  const toggle = (id: string) =>
    setUnticked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const note = reviewSummary([...proposals.values()]);
  const oldest = items.reduce((min, i) => (i.date < min ? i.date : min), items[0]?.date ?? "");
  let lastDay = "";

  const saveTicked = () => {
    onSave(ticked.map((item) => ({ item, choice: proposals.get(item.id)! })));
    setUnticked(new Set());
    onClose();
  };

  return (
    <>
      <Sheet title="Movimientos nuevos" open={open} onClose={onClose} fill>
        {items.length === 0 ? (
          <p className="empty">No hay movimientos nuevos.</p>
        ) : (
          <div className="inbox">
            <div className="inbox__head">
              <span className="hint">
                {items.length} {since(oldest, now)}
              </span>
              <button
                className="link-btn"
                onClick={() => setUnticked(new Set(allTicked ? items.map((i) => i.id) : []))}
              >
                {allTicked ? "Quitar todos" : "Marcar todos"}
              </button>
            </div>
            <ul className="list inbox__list">
              {items.map((item) => {
                const p = proposals.get(item.id)!;
                const review = needsReview(p);
                const day = item.date !== lastDay ? <li className="list__day">{humanDate(item.date, now)}</li> : null;
                lastDay = item.date;
                const checked = !unticked.has(item.id);
                return (
                  <li key={item.id} className="list__item-wrap">
                    {day}
                    <div className="inbox-row">
                      <label className="inbox-row__check">
                        <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} aria-label={`Guardar ${item.merchant}`} />
                      </label>
                      <button className="inbox-row__main" onClick={() => setOpened(item)}>
                        <span className="expense__emoji" aria-hidden>
                          {categoryOf(p.category).emoji}
                        </span>
                        <span className="expense__text">
                          <span className="expense__desc inbox-row__title">
                            <span className="inbox-row__name">{p.description}</span>
                            {/* One tag at most, the most useful one, so the name stays readable. */}
                            {p.duplicate ? (
                              <span className="tag tag--warn">¿ya anotado?</span>
                            ) : review.account || review.category ? (
                              <span className="tag tag--warn">revisar</span>
                            ) : (
                              item.notices.length > 1 && <span className="tag tag--info">{item.notices.length} avisos</span>
                            )}
                          </span>
                          <span className="expense__meta">
                            {categoryOf(p.category).name} · {accountText(settings, p.account)} · {clock(item.time)}
                          </span>
                        </span>
                        <span className="expense__amount">{formatMoney(item.amount, currency)}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {note && <p className="hint inbox__note">{note}</p>}
            <div className="inbox__footer">
              <button className="btn btn--primary btn--block" disabled={ticked.length === 0} onClick={saveTicked}>
                {ticked.length === 0
                  ? "Marca los que quieres guardar"
                  : `Guardar ${ticked.length === 1 ? "1 gasto" : `${ticked.length} gastos`} · ${formatMoney(total, currency)}`}
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <InboxItemSheet
        item={opened}
        proposal={opened ? proposals.get(opened.id) ?? null : null}
        settings={settings}
        currency={currency}
        onClose={() => setOpened(null)}
        onSave={(entry) => onSave([entry])}
        onDiscard={onDiscard}
      />
    </>
  );
}

interface ItemProps {
  item: InboxItem | null;
  proposal: Proposal | null;
  settings: Settings;
  currency: string;
  onClose: () => void;
  onSave: (entry: InboxEntry) => void;
  onDiscard: (item: InboxItem) => void;
}

/** One purchase: adjust it, see how it arrived, and save or discard it. */
export function InboxItemSheet({ item, proposal, settings, currency, onClose, onSave, onDiscard }: ItemProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<CategoryId>("otros");
  const [account, setAccount] = useState("");
  const [rememberCategory, setRememberCategory] = useState(true);
  const [rememberCard, setRememberCard] = useState(true);

  useEffect(() => {
    if (!item || !proposal) return;
    setDescription(proposal.description);
    setAmount(String(proposal.amount));
    setCategory(proposal.category);
    setAccount(proposal.account ?? "");
    setRememberCategory(true);
    setRememberCard(true);
  }, [item, proposal]);

  if (!item || !proposal) return null;
  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const rule = settings.merchantCategories?.[merchantKey(item.merchant)];
  const offerCategoryRule = rule !== category;
  const cardOwner = settings.accounts.find((a) => item.last4 && a.cards?.includes(item.last4));
  const offerCardRule = !!item.last4 && !!account && cardOwner?.id !== account;
  const chosen = accountOf(settings, account);
  const [first, ...more] = item.notices;

  return (
    <Sheet title="Movimiento nuevo" open onClose={onClose} size="dialog">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({
            item,
            choice: { description: description.trim() || item.merchant, amount: parsed, category, account: account || undefined },
            rememberCategory: offerCategoryRule && rememberCategory,
            rememberCard: offerCardRule && rememberCard,
          });
          onClose();
        }}
      >
        <label className="field">
          <span>Descripción</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Monto</span>
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
        </div>
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
          {item.last4 && cardOwner && cardOwner.id === account && <small className="field__hint">Reconocida por la tarjeta terminada en {item.last4}</small>}
          {item.last4 && !cardOwner && !account && (
            <small className="field__hint">
              Tarjeta terminada en {item.last4}
              {item.credit ? ", de crédito" : ""}. Aún no sé de qué cuenta es.
            </small>
          )}
        </label>
        {(offerCategoryRule || offerCardRule) && (
          <div className="remember">
            {offerCategoryRule && (
              <label className="remember__row">
                <input type="checkbox" checked={rememberCategory} onChange={(e) => setRememberCategory(e.target.checked)} />
                <span>
                  De ahora en adelante, {item.merchant} va a {categoryOf(category).name}
                </span>
              </label>
            )}
            {offerCardRule && chosen && (
              <label className="remember__row">
                <input type="checkbox" checked={rememberCard} onChange={(e) => setRememberCard(e.target.checked)} />
                <span>
                  La tarjeta terminada en {item.last4} es de {chosen.name}
                </span>
              </label>
            )}
          </div>
        )}
        {first && (
          <div className="arrival">
            <span className="arrival__title">Cómo llegó</span>
            <p>
              {noticeName(first.kind)}, {clock(item.time)}
            </p>
            <p className="arrival__quote">“{first.text.trim()}”</p>
            {more.length > 0 && (
              <p className="arrival__more">
                También llegó por {more.map((n) => noticeName(n.kind)).join(" y ")}. Se unieron en uno solo.
              </p>
            )}
          </div>
        )}
        {proposal.duplicate && (
          <p className="hint">
            Parece que ya lo anotaste: “{proposal.duplicate.description}” por {formatMoney(proposal.duplicate.amount, currency)}. Si es el mismo,
            descártalo.
          </p>
        )}
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--danger-outline"
            onClick={() => {
              onDiscard(item);
              onClose();
            }}
          >
            Descartar
          </button>
          <button type="submit" className="btn btn--primary btn--grow" disabled={!valid}>
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
