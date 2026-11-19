import { useState } from "react";
import { accessCode, isInstalledApp, type Arrival } from "../cloud/handoff";
import type { AccountApi } from "../cloud/useAccount";
import { Sheet } from "./Sheet";

interface Props {
  /** What the opened email link brought; null keeps the sheet closed. */
  arrival: Arrival | null;
  account: AccountApi;
  onClose: () => void;
}

/**
 * Shown when the sign-in link of the email was opened. On a phone that
 * happens in the browser, not in the installed app, so the main action is
 * copying an access code to paste there; staying in the browser is the other.
 */
export function ArrivalSheet({ arrival, account, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!arrival) return null;

  if (!arrival.ok) {
    return (
      <Sheet title="Entrar" open onClose={onClose} size="dialog">
        <div className="form">
          <p className="form__error" role="alert">
            {arrival.message}
          </p>
          <button className="btn btn--block" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </Sheet>
    );
  }

  const code = accessCode(arrival.refreshToken);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("No pude copiarlo. Mantén presionado el código de abajo y elige Copiar.");
    }
  };
  const stayHere = async () => {
    setBusy(true);
    const { error: err } = await account.adoptSession(arrival.accessToken, arrival.refreshToken);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  const installed = isInstalledApp();

  return (
    <Sheet title="Ya casi entras" open onClose={onClose} size="dialog">
      <div className="form">
        {!installed && (
          <>
            <p className="signin__lead">El enlace se abrió en el navegador. Para entrar en la app que tienes en la pantalla de inicio, copia este código de acceso y pégalo allá, donde te pide el código.</p>
            <button className="btn btn--primary btn--block" onClick={() => void copy()}>
              {copied ? "Copiado · ahora abre la app y pégalo" : "Copiar código de acceso"}
            </button>
            <input className="arrival-code" readOnly value={code} aria-label="Código de acceso" onFocus={(e) => e.target.select()} />
            <p className="hint">Sirve una sola vez. No lo compartas con nadie.</p>
          </>
        )}
        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        <button className={`btn btn--block ${installed ? "btn--primary" : ""}`} disabled={busy || copied} onClick={() => void stayHere()}>
          {busy ? "Entrando…" : installed ? "Entrar" : "Usar Contame aquí, en el navegador"}
        </button>
      </div>
    </Sheet>
  );
}
