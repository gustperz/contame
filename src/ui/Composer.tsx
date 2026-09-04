import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendIcon } from "./icons";

interface Props {
  onSend: (text: string) => void;
  showSuggestions: boolean;
}

const SUGGESTIONS = ["15 mil en almuerzo", "ayer 8k de bus", "cuánto llevo hoy", "resumen del mes", "ayuda"];

export function Composer({ onSend, showSuggestions }: Props) {
  const [text, setText] = useState("");
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

  return (
    <div className="composer">
      {showSuggestions && (
        <div className="suggestions" aria-label="Ejemplos">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => onSend(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          className="composer__input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="¿Qué gastaste? Ej: 15 mil en almuerzo"
          aria-label="Escribe un gasto"
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" className="send-btn" disabled={!text.trim()} aria-label="Enviar">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
