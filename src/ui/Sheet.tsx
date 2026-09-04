import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sheet" | "dialog";
}

export function Sheet({ title, open, onClose, children, size = "sheet" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className={`sheet sheet--${size}`}
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
