import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ISODate } from "../domain/types";
import { addDays, humanDate, toISODate } from "../utils/dates";
import { CalendarIcon, CloseIcon, SendIcon } from "./icons";

interface Props {
  onSend: (text: string) => void;
  showSuggestions: boolean;
  /** Date applied to new expenses without one; null means today. */
  pinnedDate: ISODate | null;
  onPinDate: (date: ISODate | null) => void;
}

const SUGGESTIONS = ["15 mil en almuerzo", "ayer 8k de bus", "cuánto llevo hoy", "resumen del mes", "ayuda"];

export function Composer({ onSend, showSuggestions, pinnedDate, onPinDate }: Props) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    ref.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const today = toISODate(new Date());
  const yesterday = toISODate(addDays(new Date(), -1));
  const dayBefore = toISODate(addDays(new Date(), -2));
  const pinned = pinnedDate !== null;
  const label = pinned ? humanDate(pinnedDate) : "Hoy";

  const choose = (d: ISODate | null) => {
    onPinDate(d);
    setPickerOpen(false);
    ref.current?.focus();
  };

  return (
    <div className={`composer ${pinned ? "composer--pinned" : ""}`}>
      {showSuggestions && !pinned && (
        <div className="suggestions" aria-label="Ejemplos">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => onSend(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div className="datepick" role="group" aria-label="Fecha de los gastos">
          <button className={`suggestion ${!pinned ? "suggestion--active" : ""}`} onClick={() => choose(null)}>
            Hoy
          </button>
          <button className={`suggestion ${pinnedDate === yesterday ? "suggestion--active" : ""}`} onClick={() => choose(yesterday)}>
            Ayer
          </button>
          <button className={`suggestion ${pinnedDate === dayBefore ? "suggestion--active" : ""}`} onClick={() => choose(dayBefore)}>
            Antier
          </button>
          <label className="suggestion datepick__custom">
            Otra fecha
            <input
              type="date"
              max={today}
              value={pinnedDate ?? today}
              onChange={(e) => {
                if (e.target.value) choose(e.target.value);
              }}
              aria-label="Elegir fecha"
            />
          </label>
        </div>
      )}

      <form
        className="composer__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className={`date-btn ${pinned ? "date-btn--pinned" : ""}`}
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
          aria-label={pinned ? `Registrando gastos de ${label}. Cambiar fecha` : "Cambiar la fecha de los gastos"}
        >
          <CalendarIcon />
          {pinned && <span className="date-btn__label">{label}</span>}
        </button>
        <textarea
          ref={ref}
          className="composer__input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={pinned ? `Gasto de ${label.toLowerCase()}…` : "Ej: 15 mil en almuerzo"}
          aria-label="Escribe un gasto"
          autoComplete="off"
          enterKeyHint="send"
        />
        {pinned && !text && (
          <button type="button" className="icon-btn icon-btn--small" onClick={() => choose(null)} aria-label="Volver a hoy">
            <CloseIcon width={18} height={18} />
          </button>
        )}
        <button type="submit" className="send-btn" disabled={!text.trim()} aria-label="Enviar">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
