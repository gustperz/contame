import { beforeEach, describe, expect, it } from "vitest";
import { crearBuzon, type Almacen } from "../src/buzon";
import type { EstadoPendiente, Pendiente } from "../src/tipos";

const SMS_LULO =
  "Lulo Bank: Compra realizada por $37,500 en PANADERIA LA ESPIGA con tu tarjeta terminada en *1234. " +
  "Fecha 4 de marzo de 2026. Hora 8:12 a.m.";
const CORREO_LULO = `Realizaste una compra en PANADERIA LA ESPIGA por $37,500
Origen tarjeta de crédito •1234
Fecha 4 de marzo de 2026
Hora 8:12 a.m.`;
const CLAVE = "clave-larga-de-prueba";

function almacenEnMemoria(): Almacen & { todo: Map<string, Pendiente> } {
  const todo = new Map<string, Pendiente>();
  return {
    todo,
    async obtener(id) { return todo.get(id) ?? null; },
    async guardar(p) { todo.set(p.id, p); },
    async listar(estado: EstadoPendiente) { return [...todo.values()].filter((p) => p.estado === estado); },
  };
}

describe("buzón", () => {
  let almacen: ReturnType<typeof almacenEnMemoria>;
  let buzon: ReturnType<typeof crearBuzon>;
  const pedir = (ruta: string, init?: RequestInit, clave = CLAVE) =>
    buzon.atender(new Request(`https://buzon.ejemplo.com${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${clave}`, ...(init?.headers ?? {}) },
    }));

  beforeEach(() => {
    almacen = almacenEnMemoria();
    buzon = crearBuzon({ almacen, clave: CLAVE, origen: "https://gustperz.github.io" });
  });

  it("responde la consulta previa del navegador con los permisos de origen", async () => {
    const res = await buzon.atender(new Request("https://buzon.ejemplo.com/pendientes", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://gustperz.github.io");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("no deja entrar sin la clave", async () => {
    expect((await pedir("/pendientes", {}, "equivocada")).status).toBe(401);
    expect((await pedir("/pendientes", {}, "")).status).toBe(401);
  });

  it("convierte un aviso en pendiente y lo devuelve en la lista", async () => {
    const res = await pedir("/aviso", { method: "POST", body: SMS_LULO });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ estado: "leido", nuevo: true });

    const lista = await (await pedir("/pendientes")).json();
    expect(lista.pendientes).toHaveLength(1);
    expect(lista.pendientes[0]).toMatchObject({ monto: 37500, comercio: "Panaderia La Espiga", last4: "1234" });
  });

  it("une el correo y el SMS de la misma compra en un solo pendiente", async () => {
    await pedir("/aviso", { method: "POST", body: SMS_LULO });
    const segundo = await (await pedir("/aviso", { method: "POST", body: CORREO_LULO })).json();
    expect(segundo).toMatchObject({ estado: "leido", nuevo: false });

    const lista = await (await pedir("/pendientes")).json();
    expect(lista.pendientes).toHaveLength(1);
    expect(lista.pendientes[0].avisos).toHaveLength(2);
    expect(lista.pendientes[0].credito).toBe(true);
  });

  it("ignora los mensajes que no son compras", async () => {
    const res = await pedir("/aviso", { method: "POST", body: "Ingresa la clave 2492 para ver los datos de tu tarjeta." });
    expect(await res.json()).toEqual({ estado: "ignorado" });
    expect(almacen.todo.size).toBe(0);
  });

  it("saca de la lista lo que ya guardaste", async () => {
    const { pendiente } = await (await pedir("/aviso", { method: "POST", body: SMS_LULO })).json();
    const res = await pedir("/estado", { method: "POST", body: JSON.stringify({ id: pendiente.id, estado: "guardado" }) });
    expect(res.status).toBe(200);
    expect((await (await pedir("/pendientes")).json()).pendientes).toHaveLength(0);
  });

  it("un aviso que llega tarde no revive lo ya guardado", async () => {
    const { pendiente } = await (await pedir("/aviso", { method: "POST", body: SMS_LULO })).json();
    await pedir("/estado", { method: "POST", body: JSON.stringify({ id: pendiente.id, estado: "guardado" }) });
    await pedir("/aviso", { method: "POST", body: CORREO_LULO });
    expect((await (await pedir("/pendientes")).json()).pendientes).toHaveLength(0);
  });

  it("rechaza lo que no entiende", async () => {
    expect((await pedir("/aviso", { method: "POST", body: "   " })).status).toBe(400);
    expect((await pedir("/estado", { method: "POST", body: JSON.stringify({ id: "x" }) })).status).toBe(400);
    expect((await pedir("/estado", { method: "POST", body: JSON.stringify({ id: "x", estado: "guardado" }) })).status).toBe(404);
    expect((await pedir("/otra-cosa")).status).toBe(404);
  });
});
