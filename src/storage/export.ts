import type { Expense, Payment, Settings } from "../domain/types";
import { accountOf } from "../domain/accounts";
import { categoryOf } from "../domain/categories";
import type { AppState } from "./store";
import { sanitize } from "./store";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function expensesToCsv(expenses: Expense[], settings?: Settings, payments: Payment[] = []): string {
  const header = ["tipo", "fecha", "monto", "categoria", "cuenta", "descripcion", "mensaje"];
  const name = (id: string | undefined) => (settings ? (accountOf(settings, id)?.name ?? "") : (id ?? ""));
  const all: Array<{ date: string; createdAt: number; cells: Array<string | number> }> = [
    ...expenses.map((e) => ({ date: e.date, createdAt: e.createdAt, cells: ["gasto", e.date, e.amount, categoryOf(e.category).name, name(e.account), e.description, e.source ?? ""] })),
    ...payments.map((p) => ({ date: p.date, createdAt: p.createdAt, cells: ["pago tarjeta", p.date, p.amount, "Deuda", name(p.fromAccount), `Pago ${name(p.toAccount) || "tarjeta"}`, p.source ?? ""] })),
  ];
  const rows = all
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((r) => r.cells.map(csvCell).join(","));
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
