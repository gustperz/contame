import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ISODate, Settings } from "../domain/types";
import { accountOf } from "../domain/accounts";
import { addDays, humanDate, toISODate } from "../utils/dates";
import { CalendarIcon, CloseIcon, SendIcon } from "./icons";

interface Props {
  onSend: (text: string) => void;
  showSuggestions: boolean;
  /** Date applied to new expenses without one; null means today. */
  pinnedDate: ISODate | null;
  onPinDate: (date: ISODate | null) => void;
  /** Account applied to new expenses without one; null means the default account. */
  pinnedAccount: string | null;
  onPinAccount: (id: string | null) => void;
  settings: Settings;
}

const SUGGESTIONS = ["15 mil en almuerzo", "ayer 8k de bus", "cuánto llevo hoy", "resumen del mes", "ayuda"];

export function Composer({ onSend, showSuggestions, pinnedDate, onPinDate, pinnedAccount, onPinAccount, settings }: Props) {
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
  /** Effective account for the next expense: pinned, else the default, else none. */
  const effectiveAccountId = pinnedAccount === null ? settings.defaultAccount ?? "" : pinnedAccount;
  const account = accountOf(settings, effectiveAccountId || undefined);
  const accountPinned = pinnedAccount !== null;
  const anyPinned = pinned || accountPinned;

  const chooseAccount = (id: string | null) => {
    onPinAccount(id);
    setPickerOpen(false);
    ref.current?.focus();
  };

  const choose = (d: ISODate | null) => {
    onPinDate(d);
    setPickerOpen(false);
    ref.current?.focus();
  };
  void choose;

  return (
    <div className={`composer ${anyPinned ? "composer--pinned" : ""}`}>
      {showSuggestions && !anyPinned && (
        <div className="suggestions" aria-label="Ejemplos">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => onSend(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {pickerOpen && settings.accounts.length > 0 && (
        <div className="datepick" role="group" aria-label="Cuenta de los gastos">
          <button className={`suggestion ${effectiveAccountId === "" ? "suggestion--active" : ""}`} onClick={() => chooseAccount("")}>
            Sin cuenta
          </button>
          {settings.accounts.map((a) => (
            <button key={a.id} className={`suggestion ${effectiveAccountId === a.id ? "suggestion--active" : ""}`} onClick={() => chooseAccount(a.id)}>
              {a.emoji} {a.name}
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
          className={`date-btn ${anyPinned ? "date-btn--pinned" : ""}`}
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
          aria-label={anyPinned ? `Registrando en ${label}${account ? ` con ${account.name}` : ""}. Cambiar` : "Cambiar la fecha o la cuenta de los gastos"}
        >
          {accountPinned ? <span aria-hidden>{account?.emoji ?? "🚫"}</span> : <CalendarIcon />}
          {pinned && <span className="date-btn__label">{label}</span>}
          {accountPinned && !pinned && <span className="date-btn__label">{account?.name ?? "Sin cuenta"}</span>}
        </button>
        <textarea
          ref={ref}
          className="composer__input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            pinned && accountPinned
              ? `${label} · ${account?.name ?? "sin cuenta"}…`
              : pinned
                ? `Gasto de ${label.toLowerCase()}…`
                : accountPinned
                  ? account
                    ? `Gasto con ${account.name}…`
                    : "Gasto sin cuenta…"
                  : "Ej: 15 mil en almuerzo"
          }
          aria-label="Escribe un gasto"
          autoComplete="off"
          enterKeyHint="send"
        />
        {anyPinned && !text && (
          <button
            type="button"
            className="icon-btn icon-btn--small"
            onClick={() => {
              onPinDate(null);
              onPinAccount(null);
              setPickerOpen(false);
              ref.current?.focus();
            }}
            aria-label="Volver a hoy y a la cuenta habitual"
          >
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
