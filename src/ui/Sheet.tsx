import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sheet" | "dialog";
  /** Keep a fixed height so the sheet does not resize when its content changes. */
  fill?: boolean;
}

/**
 * Sheets can stack (editing an expense from the summary, signing in from the
 * settings). Only the top one answers Escape, and the page behind stays locked
 * until the last one closes.
 */
const openSheets: symbol[] = [];

export function Sheet({ title, open, onClose, children, size = "sheet", fill = false }: Props) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const me = Symbol(title);
    openSheets.push(me);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openSheets[openSheets.length - 1] === me) close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = openSheets.indexOf(me);
      if (i !== -1) openSheets.splice(i, 1);
      if (openSheets.length === 0) document.body.style.overflow = "";
    };
    // Registered once per opening: a new onClose identity must not reorder the stack.
  }, [open]);

  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className={`sheet sheet--${size}${fill ? " sheet--fill" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
