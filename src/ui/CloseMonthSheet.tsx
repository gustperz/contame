import { useEffect, useMemo, useState } from "react";
import type { ISODate, Settings } from "../domain/types";
import type { SpendItem } from "../domain/credit";
import { categoryOf } from "../domain/categories";
import { formatMoney } from "../utils/money";
import { addDays, dayMonth, fromISODate, humanDate, toISODate } from "../utils/dates";
import { closePreview, monthName, type Closing } from "../utils/months";
import { Sheet } from "./Sheet";

interface Props {
  /** The change of month to close; null keeps the sheet closed. */
  closing: Closing | null;
  items: SpendItem[];
  settings: Settings;
  onConfirm: (opens: string, date: ISODate) => void;
  onClose: () => void;
}

type Choice = "yesterday" | "today" | "other";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Closing a month on payday: from the chosen day spending counts in the next
 * month. Nothing is rewritten; expenses keep their dates.
 */
export function CloseMonthSheet({ closing, items, settings, onConfirm, onClose }: Props) {
  const today = toISODate(new Date());
  const yesterday = toISODate(addDays(fromISODate(today), -1));
  const canYesterday = !!closing && yesterday >= closing.min;
  const [choice, setChoice] = useState<Choice>("yesterday");
  const [other, setOther] = useState(today);
  useEffect(() => {
    if (!closing) return;
    setChoice(canYesterday ? "yesterday" : "today");
    setOther(today);
  }, [closing?.opens]);

  const date = choice === "yesterday" ? yesterday : choice === "today" ? today : other;
  const valid = !!closing && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= closing.min && date <= closing.max;
  const preview = useMemo(() => (closing && valid ? closePreview(items, settings.monthStarts, closing, date) : null), [items, settings.monthStarts, closing, date, valid]);
  if (!closing) return null;

  const closes = monthName(closing.closes);
  const opens = monthName(closing.opens);
  const money = (n: number) => formatMoney(n, settings.currency);
  const count = (n: number) => `${n} ${n === 1 ? "gasto" : "gastos"}`;
  // Closing after the 1st keeps those first days in the month that ends.
  const late = date > `${closing.opens}-01`;

  return (
    <Sheet title={`Cerrar ${closes}`} open onClose={onClose}>
      <form
        className="form close-month"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onConfirm(closing.opens, date);
          onClose();
        }}
      >
        <fieldset className="field close-month__days">
          <legend>¿Desde qué día empieza {opens}?</legend>
          <div className="day-choices">
            {canYesterday && (
              <button type="button" className={`day-choice ${choice === "yesterday" ? "day-choice--active" : ""}`} aria-pressed={choice === "yesterday"} onClick={() => setChoice("yesterday")}>
                <strong>Ayer</strong>
                <span>{dayMonth(yesterday)}</span>
              </button>
            )}
            <button type="button" className={`day-choice ${choice === "today" ? "day-choice--active" : ""}`} aria-pressed={choice === "today"} onClick={() => setChoice("today")}>
              <strong>Hoy</strong>
              <span>{dayMonth(today)}</span>
            </button>
            <button type="button" className={`day-choice ${choice === "other" ? "day-choice--active" : ""}`} aria-pressed={choice === "other"} onClick={() => setChoice("other")}>
              <strong>Otro día</strong>
              <span>{choice === "other" && valid ? dayMonth(other) : "elegir"}</span>
            </button>
          </div>
          {choice === "other" && (
            <input type="date" aria-label="Día en que empieza el mes" value={other} min={closing.min} max={closing.max} onChange={(e) => setOther(e.target.value)} required />
          )}
          <span className="field__hint">El día que te pagaron.</span>
        </fieldset>

        {preview && (
          <>
            <div className="month-boxes">
              <div className="month-box">
                <span className="month-box__name">{closes}</span>
                <span className="month-box__range">
                  {dayMonth(preview.closes.range.from)} – {dayMonth(preview.closes.range.to)}
                </span>
                <span className="month-box__total">{money(preview.closes.total)}</span>
                <span className="month-box__range">{count(preview.closes.count)}</span>
              </div>
              <div className="month-box month-box--next">
                <span className="month-box__name">{opens}</span>
                <span className="month-box__range">desde el {dayMonth(preview.opens.from)}</span>
                <span className="month-box__total">{money(preview.opens.total)}</span>
                <span className="month-box__range">{preview.opens.count ? `${count(preview.opens.count)} ya` : "sin gastos aún"}</span>
              </div>
            </div>

            {preview.moved.length > 0 && (
              <section className="close-month__moved">
                <h3>{late ? `Se quedan en ${closes}` : `Pasan a ${opens}`}</h3>
                <ul className="list close-month__list">
                  {preview.moved.map((i) => {
                    const cat = categoryOf(i.category);
                    return (
                      <li key={i.id} className="moved-item">
                        <span className="expense__emoji" aria-hidden>
                          {cat.emoji}
                        </span>
                        <span className="expense__text">
                          <span className="expense__desc">{i.description}</span>
                          <span className="expense__meta">
                            {cap(humanDate(i.date))} · {cat.name}
                          </span>
                        </span>
                        <span className="expense__amount">{money(i.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="hint">Ningún gasto cambia de fecha: solo cambia en qué mes se cuenta. Puedes reabrir {closes} cuando quieras.</p>
        <button type="submit" className="btn btn--primary btn--block" disabled={!valid}>
          Cerrar {closes}
        </button>
      </form>
    </Sheet>
  );
}
