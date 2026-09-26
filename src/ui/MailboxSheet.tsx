import { useEffect, useState } from "react";
import type { Settings } from "../domain/types";
import type { AccountState } from "../cloud/useAccount";
import { mailboxFiles, useMailbox, type UnmatchedMessage } from "../cloud/inbox/useMailbox";
import { timeAgo } from "../utils/dates";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  account: AccountState;
  settings: Settings;
  /** Looks for new purchases right away. */
  onCheckNow: () => void;
}

/**
 * The files made with a new key, kept for a while: iOS may reload the app
 * while the person is pasting in Safari, and the key is shown only this once.
 */
const PENDING_KEY = "contame:mailbox:pending";
const PENDING_TTL_MS = 30 * 60_000;
type Files = { code: string; manifest: string };

function loadPending(): Files | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as (Files & { at: number }) | null;
    return p && Date.now() - p.at < PENDING_TTL_MS ? { code: p.code, manifest: p.manifest } : null;
  } catch {
    return null;
  }
}

function savePending(files: Files | null) {
  try {
    if (files) localStorage.setItem(PENDING_KEY, JSON.stringify({ ...files, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Only costs creating the key again.
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Setting up the mailbox that feeds the inbox: a Google Apps Script in the
 * person's own account that reads the bank's emails. Shows its status, hands
 * out its two files, and lists the cards it recognises and the emails it
 * could not read.
 */
export function MailboxSheet({ open, onClose, account, settings, onCheckNow }: Props) {
  const mailbox = useMailbox(account, open);
  const { state } = mailbox;
  const [files, setFiles] = useState<Files | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setFiles(loadPending());
    else setNote(null);
  }, [open]);

  const key = state.status === "ready" ? state.key : null;
  const lastSeen = key?.lastUsedAt ?? null;

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? null : n)), 2500);
  };

  const createKey = async () => {
    if (key && !confirm("El script que ya tienes dejará de funcionar hasta que pegues el código nuevo. ¿Continuar?")) return;
    setBusy(true);
    try {
      const made = await mailboxFiles(await mailbox.createKey());
      savePending(made);
      setFiles(made);
    } catch (err) {
      alert(`No pude crear la clave: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    savePending(null);
    setFiles(null);
    onCheckNow();
    void mailbox.reload();
  };

  const cards = settings.accounts.flatMap((a) => (a.cards ?? []).map((last4) => ({ last4, account: a })));

  return (
    <Sheet title="Bandeja automática" open={open} onClose={onClose} fill>
      <p className="hint">
        Un script en tu propia cuenta de Google revisa tu Gmail cada 5 minutos y deja las compras del banco en tu bandeja para que las confirmes aquí. Por ahora lee
        los correos de compra de Lulo.
      </p>

      {state.status === "loading" && <p className="hint">Cargando…</p>}
      {state.status === "error" && (
        <div className="account-card sync sync--bad" role="status">
          <i className="sync__dot" aria-hidden="true" />
          <div>
            <span className="sync__title">No pude conectarme</span>
            <span className="sync__detail">{state.message}</span>
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className={`account-card sync ${key && lastSeen ? "" : "sync--wait"}`} role="status">
            <i className="sync__dot" aria-hidden="true" />
            <div>
              <span className="sync__title">{!key ? "Sin configurar" : lastSeen ? "Conectada" : "Esperando el primer aviso"}</span>
              <span className="sync__detail">
                {!key
                  ? "Crea el código y sigue los pasos."
                  : lastSeen
                    ? `Último aviso recibido ${timeAgo(Date.parse(lastSeen))}`
                    : "Aparece aquí cuando llegue el primer correo de compra."}
              </span>
              {state.lastNoticeAt && <span className="sync__detail">Última compra en la bandeja {timeAgo(Date.parse(state.lastNoticeAt))}</span>}
            </div>
          </div>

          <section className="section">
            <h3>Conectar con Gmail</h3>
            {files ? (
              <>
                <p className="hint">Copia y pega cada archivo como dicen los pasos. El código lleva tu clave: solo se ofrece ahora, así que no cierres esto hasta terminar.</p>
                <div className="btn-row">
                  <button className="btn" onClick={async () => flash((await copy(files.manifest)) ? "appsscript.json copiado" : "No pude copiar")}>
                    1. Copiar appsscript.json
                  </button>
                  <button className="btn btn--primary" onClick={async () => flash((await copy(files.code)) ? "Código.gs copiado" : "No pude copiar")}>
                    2. Copiar Código.gs
                  </button>
                </div>
              </>
            ) : key ? (
              <>
                <p className="hint">
                  Ya tienes un script con clave, creada {timeAgo(Date.parse(key.createdAt))}. Para volver a copiar el código hace falta una clave nueva, y la anterior
                  deja de servir.
                </p>
                <div className="btn-row">
                  <button className="btn" onClick={createKey} disabled={busy}>
                    Crear clave nueva
                  </button>
                </div>
              </>
            ) : (
              <div className="btn-row">
                <button className="btn btn--primary" onClick={createKey} disabled={busy}>
                  Crear clave y código
                </button>
              </div>
            )}
            <details className="steps" open={!!files}>
              <summary>Pasos</summary>
              <ol>
                <li>
                  Abre <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a> en Safari, con "Solicitar
                  sitio web de escritorio", y crea un proyecto nuevo.
                </li>
                <li>
                  En Configuración del proyecto (el engranaje) marca <b>Mostrar el archivo de manifiesto "appsscript.json"</b>.
                </li>
                <li>
                  En el Editor abre <b>appsscript.json</b>, borra todo y pega el paso 1.
                </li>
                <li>
                  Abre <b>Código.gs</b>, borra todo, pega el paso 2 y guarda.
                </li>
                <li>
                  Arriba elige la función <b>install</b> y toca <b>Ejecutar</b>. Google pide permiso: como el script es tuyo y no está publicado, avisa que no está
                  verificado. Toca Configuración avanzada → Ir al proyecto → Permitir. Solo pide leer tu correo, conectarse a Contame y programarse.
                </li>
                <li>Listo: revisa cada 5 minutos. En Ejecuciones ves lo que hizo cada vez.</li>
              </ol>
              {files && (
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={done}>
                    Ya lo instalé
                  </button>
                </div>
              )}
            </details>
          </section>

          {cards.length > 0 && (
            <section className="section">
              <h3>Tarjetas reconocidas</h3>
              <ul className="list cards-list">
                {cards.map((c) => (
                  <li key={c.last4} className="cards-list__row">
                    <span>Termina en {c.last4}</span>
                    <span>
                      {c.account.emoji} {c.account.name}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">Se editan en cada cuenta, o al confirmar un movimiento de una tarjeta nueva.</p>
            </section>
          )}

          {state.unmatched.length > 0 && (
            <section className="section">
              <h3>Correos que no entendí</h3>
              <p className="hint">Parecían de compras pero no pude leerlos. Si se repite, puede que el banco haya cambiado el formato.</p>
              <ul className="unmatched">
                {state.unmatched.map((m) => (
                  <Unmatched key={m.id} message={m} onDismiss={() => void mailbox.dismiss(m.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {note && (
        <p className="toast" role="status">
          {note}
        </p>
      )}

      <div className="btn-row mailbox__footer">
        <button
          className="btn btn--block"
          onClick={() => {
            onCheckNow();
            void mailbox.reload();
          }}
        >
          Revisar ahora
        </button>
      </div>
    </Sheet>
  );
}

function Unmatched({ message, onDismiss }: { message: UnmatchedMessage; onDismiss: () => void }) {
  return (
    <li className="unmatched__item">
      <details>
        <summary>
          <span className="unmatched__subject">{message.subject || "(sin asunto)"}</span>
          <span className="unmatched__meta">
            {message.sender ?? "?"} · {timeAgo(Date.parse(message.receivedAt))}
          </span>
        </summary>
        <p className="unmatched__body">{message.body}</p>
        <button className="chip-btn chip-btn--danger" onClick={onDismiss}>
          Quitar
        </button>
      </details>
    </li>
  );
}
