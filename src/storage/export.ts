import type { Expense, Settings } from "../domain/types";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import type { AppState } from "./store";
import { sanitize } from "./store";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function expensesToCsv(expenses: Expense[], settings?: Settings): string {
  const header = ["fecha", "monto", "categoria", "cuenta", "descripcion", "mensaje"];
  const rows = [...expenses]
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((e) => [e.date, e.amount, categoryOf(e.category).name, settings ? (accountOf(settings, e.account)?.name ?? "") : (e.account ?? ""), e.description, e.source ?? ""].map(csvCell).join(","));
  return "﻿" + [header.join(","), ...rows].join("\n");
}

export function stateToJson(state: AppState): string {
  return JSON.stringify({ app: "contame", exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function jsonToState(text: string): AppState {
  const parsed = JSON.parse(text) as Partial<AppState>;
  if (!Array.isArray(parsed.expenses)) throw new Error("El archivo no tiene gastos válidos");
  return sanitize(parsed);
}

export function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
