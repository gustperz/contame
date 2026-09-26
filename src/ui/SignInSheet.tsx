import { useEffect, useState } from "react";
import type { AccountApi } from "../cloud/useAccount";
import { looksLikeEmail } from "../cloud/errors";
import { parseEmailLink, type EmailLink } from "../cloud/emailLink";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  account: AccountApi;
}

/** Where the code step is remembered, in case iOS reloads the app while the person reads their mail. */
const PENDING_KEY = "contame:signin";
const PENDING_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_S = 45;

interface Pending {
  email: string;
  sentAt: number;
}

function loadPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    if (!p || typeof p.email !== "string" || typeof p.sentAt !== "number") return null;
    return Date.now() - p.sentAt > PENDING_TTL_MS ? null : p;
  } catch {
    return null;
  }
}

function savePending(p: Pending | null): void {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* Without storage the flow still works; it just is not remembered. */
  }
}

/**
 * Sign-in with a one-time code typed inside the app. A magic link would open
 * in Safari, whose storage is separate from the home-screen app, and the
 * session would end up in the wrong place.
 */
export function SignInSheet({ open, onClose, account }: Props) {
  // Read on mount so reopening after a reload starts on the right step, with no flash of the email step.
  const [pending, setPending] = useState<Pending | null>(loadPending);
  const [email, setEmail] = useState(() => pending?.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const p = loadPending();
    setPending(p);
    if (p) setEmail(p.email);
    setCode("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (open && account.state.status === "signedIn") {
      savePending(null);
      onClose();
    }
  }, [open, account.state.status, onClose]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const send = async () => {
    if (!looksLikeEmail(email)) {
      setError("Ese correo no parece válido. Revísalo.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await account.sendCode(email);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    const p = { email: email.trim(), sentAt: Date.now() };
    savePending(p);
    setPending(p);
    setNow(Date.now());
    setCode("");
  };

  const verify = async () => {
    // Supabase sends between 6 and 10 digits depending on the project's settings.
    if (!pending || code.length < 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await account.verifyCode(pending.email, code);
    setBusy(false);
    if (err) setError(err);
  };

  /** A pasted link signs in straight away: there is nothing left to type. */
  const verifyWithLink = async (link: EmailLink) => {
    setBusy(true);
    setError(null);
    setCode("");
    const { error: err } = await account.verifyLink(link.tokenHash, link.type);
    setBusy(false);
    if (err) setError(err);
  };

  const onCodeInput = (value: string) => {
    const link = parseEmailLink(value);
    if (link) {
      void verifyWithLink(link);
      return;
    }
    setCode(value.replace(/\D/g, "").slice(0, 10));
  };

  const useOtherEmail = () => {
    savePending(null);
    setPending(null);
    setCode("");
    setError(null);
  };

  const waitS = pending ? Math.max(0, RESEND_AFTER_S - Math.floor((now - pending.sentAt) / 1000)) : 0;

  return (
    <Sheet title="Entrar" open={open} onClose={onClose} size="dialog">
      {!pending ? (
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="signin__lead">Entra con tu correo para que tus gastos se guarden en tu cuenta y estén en todos tus dispositivos.</p>
          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              required
              autoFocus
            />
          </label>
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email.trim()}>
            {busy ? "Enviando…" : "Enviarme un código"}
          </button>
          <p className="hint">Te llega un código al correo. No hay contraseña que recordar, y solo lo haces una vez en cada dispositivo.</p>
        </form>
      ) : (
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="signin__lead">
            Te mandé un código a <strong>{pending.email}</strong>. Si no lo ves, revisa el correo no deseado.
          </p>
          <label className="field">
            <span>Código</span>
            <input
              className="signin__code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => onCodeInput(e.target.value)}
              placeholder="Código o enlace"
              aria-label="Código que llegó al correo"
              autoFocus
            />
          </label>
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || code.length < 6}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <p className="hint">
            ¿Te llegó un enlace en vez de un código? No lo abras, porque abrirlo lo gasta. Mantenlo presionado, elige Copiar y pégalo aquí arriba.
          </p>
          <div className="signin__row">
            <button type="button" className="chip-btn" onClick={useOtherEmail}>
              Usar otro correo
            </button>
            <button type="button" className="chip-btn" onClick={() => void send()} disabled={busy || waitS > 0}>
              {waitS > 0 ? `Reenviar en ${waitS} s` : "Reenviar código"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
