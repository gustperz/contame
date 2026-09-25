import { useRef } from "react";
import type { Account, Settings } from "../domain/types";
import { newAccountId } from "../domain/accounts";
import { TrashIcon } from "./icons";
import { CURRENCIES } from "../utils/money";
import { Sheet } from "./Sheet";
import { downloadFile, jsonToState, stateToJson } from "../storage/export";
import type { AppState } from "../storage/store";
import type { AccountApi } from "../cloud/useAccount";

interface Props {
  open: boolean;
  onClose: () => void;
  state: AppState;
  onSettings: (s: Partial<Settings>) => void;
  onAccounts: (accounts: Account[], defaultAccount?: string) => void;
  onImport: (s: AppState) => void;
  onClear: () => void;
  account: AccountApi;
  onSignIn: () => void;
}

export function SettingsSheet({ open, onClose, state, onSettings, onAccounts, onImport, onClear, account, onSignIn }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    try {
      const imported = jsonToState(await file.text());
      const ok = confirm(`El respaldo tiene ${imported.expenses.length} gastos. Reemplazará los datos actuales (${state.expenses.length} gastos). ¿Continuar?`);
      if (ok) {
        onImport(imported);
        onClose();
      }
    } catch (err) {
      alert(`No pude leer el archivo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Sheet title="Ajustes" open={open} onClose={onClose}>
      <AccountSection account={account} onSignIn={onSignIn} />

      <section className="section">
        <label className="field">
          <span>Moneda</span>
          <select value={state.settings.currency} onChange={(e) => onSettings({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <AccountsEditor settings={state.settings} onChange={onAccounts} />

      <section className="section">
        <h3>Tus datos</h3>
        <p className="hint">
          Todo se guarda solo en este dispositivo, dentro del navegador. Haz un respaldo de vez en cuando para no perder nada si cambias de teléfono o borras los datos del navegador.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => downloadFile(`contame-respaldo-${new Date().toISOString().slice(0, 10)}.json`, stateToJson(state), "application/json")}>
            Descargar respaldo
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restaurar respaldo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </div>
      </section>

      <section className="section">
        <h3>Zona de peligro</h3>
        <button
          className="btn btn--danger"
          onClick={() => {
            if (confirm("¿Borrar todos los gastos y la conversación? Esta acción no se puede deshacer.")) {
              onClear();
              onClose();
            }
          }}
        >
          Borrar todo
        </button>
      </section>

      <section className="section about">
        <p className="hint">
          Contame · {state.expenses.length} gastos registrados. Escribe “ayuda” en el chat para ver ejemplos de lo que entiendo.
        </p>
      </section>
    </Sheet>
  );
}

interface AccountsEditorProps {
  settings: Settings;
  onChange: (accounts: Account[], defaultAccount?: string) => void;
}

function AccountsEditor({ settings, onChange }: AccountsEditorProps) {
  const { accounts, defaultAccount } = settings;
  const update = (id: string, patch: Partial<Account>) => onChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)), defaultAccount);
  const remove = (a: Account) => {
    if (!confirm(`¿Eliminar la cuenta "${a.name}"? Sus gastos quedarán sin cuenta.`)) return;
    onChange(accounts.filter((x) => x.id !== a.id), defaultAccount === a.id ? undefined : defaultAccount);
  };
  const add = () => {
    const name = prompt("Nombre de la cuenta (por ejemplo: Nequi)");
    if (!name?.trim()) return;
    const id = newAccountId(name, accounts);
    onChange([...accounts, { id, name: name.trim(), emoji: "💳", aliases: [name.trim().toLowerCase()] }], defaultAccount);
  };

  return (
    <section className="section">
      <h3>Cuentas</h3>
      <p className="hint">
        Nombra la cuenta en el mensaje ("almuerzo 15 mil con nequi") o escribe solo su nombre para dejarla fija. Los alias son las palabras que la identifican, separadas por comas. Si una cuenta es tarjeta de crédito, sus compras cuentan como cualquier gasto y quedan marcadas como crédito; cuando pagas la tarjeta ("pagué la tarjeta 318 mil desde bogotá") el pago va a la categoría Deuda.
      </p>
      {accounts.length > 0 && (
        <label className="field field--inline">
          <span>Si no nombro ninguna</span>
          <select value={defaultAccount ?? ""} onChange={(e) => onChange(accounts, e.target.value || undefined)}>
            <option value="">Queda sin cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {accounts.length === 0 && <p className="empty">No tienes cuentas. Agrega una para empezar a asociar gastos.</p>}
      <ul className="accounts">
        {accounts.map((a) => (
          <li key={a.id} className="account">
            <div className="account__row">
              <input
                className="account__emoji"
                value={a.emoji}
                onChange={(e) => update(a.id, { emoji: lastGrapheme(e.target.value) || a.emoji })}
                onFocus={(e) => e.target.select()}
                aria-label="Emoji"
              />
              <input className="account__name" value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} aria-label="Nombre" maxLength={40} />
              <button className="icon-btn icon-btn--small" onClick={() => remove(a)} aria-label={`Eliminar ${a.name}`}>
                <TrashIcon />
              </button>
            </div>
            <label className="account__credit">
              <input
                type="checkbox"
                checked={!!a.credit}
                onChange={(e) => update(a.id, e.target.checked ? { credit: true } : { credit: undefined, initialDebt: undefined })}
              />
              <span>Es tarjeta de crédito</span>
            </label>
            {a.credit && (
              <label className="field">
                <span>Deuda al empezar a usar la app</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={a.initialDebt ?? ""}
                  placeholder="0"
                  onChange={(e) => update(a.id, { initialDebt: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
                />
                <span className="hint">Lo que ya debías. Los primeros pagos la cubren antes que las compras nuevas, y no cuentan como gasto.</span>
              </label>
            )}
            <input
              className="account__aliases"
              value={a.aliases.join(", ")}
              onChange={(e) => update(a.id, { aliases: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              placeholder="alias, separados, por comas"
              aria-label={`Alias de ${a.name}`}
            />
          </li>
        ))}
      </ul>
      <button className="btn" onClick={add}>
        Agregar cuenta
      </button>
    </section>
  );
}

/**
 * Keeps only the last visible character typed, so a new emoji replaces the previous one
 * (composed emojis like flags or skin tones count as one).
 */
function lastGrapheme(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let last = "";
    for (const s of seg.segment(text)) last = s.segment;
    return last;
  }
  const chars = Array.from(text);
  return chars[chars.length - 1] ?? "";
}

function AccountSection({ account, onSignIn }: { account: AccountApi; onSignIn: () => void }) {
  const { state } = account;
  if (state.status === "unavailable") return null;
  return (
    <section className="section">
      <h3>Cuenta</h3>
      {state.status === "loading" && <p className="hint">Revisando tu sesión…</p>}
      {state.status === "signedOut" && (
        <>
          <p className="hint">Entra con tu correo para guardar tus gastos en tu cuenta y usarlos en varios dispositivos.</p>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={onSignIn}>
              Entrar
            </button>
          </div>
        </>
      )}
      {state.status === "signedIn" && (
        <>
          <div className="account-card">
            <span className="account-card__email">{state.email}</span>
            <span className="hint">Por ahora tus gastos siguen guardándose solo en este teléfono. La sincronización llega en la próxima actualización.</span>
          </div>
          <div className="btn-row">
            <button
              className="btn"
              onClick={async () => {
                const { error } = await account.signOut();
                if (error) alert(error);
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </section>
  );
}
