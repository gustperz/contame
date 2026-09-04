import { useRef } from "react";
import type { Settings } from "../domain/types";
import { CURRENCIES } from "../utils/money";
import { Sheet } from "./Sheet";
import { downloadFile, jsonToState, stateToJson } from "../storage/export";
import type { AppState } from "../storage/store";

interface Props {
  open: boolean;
  onClose: () => void;
  state: AppState;
  onSettings: (s: Partial<Settings>) => void;
  onImport: (s: AppState) => void;
  onClear: () => void;
}

export function SettingsSheet({ open, onClose, state, onSettings, onImport, onClear }: Props) {
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
