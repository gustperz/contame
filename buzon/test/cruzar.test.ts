import { describe, expect, it } from "vitest";
import { claveDe, cruzar } from "../src/cruzar";
import type { Aviso, Movimiento, Pendiente } from "../src/tipos";

const compra = (monto: number, hora: string, comercio = "Multicine", last4 = "1234"): Movimiento => ({
  monto, comercio, last4, fecha: "2026-03-04", hora, credito: false,
});
const aviso = (tipo: Aviso["tipo"], texto: string = tipo): Aviso => ({ tipo, texto, recibidoEn: "2026-03-04T13:00:00.000Z" });
const AHORA = "2026-03-04T13:00:00.000Z";

describe("claveDe", () => {
  it("une los avisos de la misma compra y separa los de compras distintas", () => {
    expect(claveDe(compra(22000, "18:51"))).toBe(claveDe(compra(22000, "18:51", "MULTICINE UNICENTRO")));
    expect(claveDe(compra(22000, "18:51"))).not.toBe(claveDe(compra(65000, "18:51")));
    expect(claveDe(compra(22000, "18:51"))).not.toBe(claveDe(compra(22000, "18:54")));
    expect(claveDe(compra(22000, "18:51", "Multicine", "5678"))).not.toBe(claveDe(compra(22000, "18:51")));
  });
});

describe("cruzar", () => {
  it("crea el pendiente con el primer aviso que llega", () => {
    const p = cruzar(null, compra(37500, "08:12"), aviso("sms-lulo"), AHORA);
    expect(p).toMatchObject({ monto: 37500, estado: "pendiente", creadoEn: AHORA });
    expect(p.avisos).toHaveLength(1);
  });

  it("suma el segundo aviso de la misma compra en vez de duplicarla", () => {
    const uno = cruzar(null, compra(37500, "08:12", "Panaderia"), aviso("sms-lulo"), AHORA);
    const dos = cruzar(uno, compra(37500, "08:12", "Panaderia La Espiga"), aviso("correo-lulo"), AHORA);
    expect(dos.id).toBe(uno.id);
    expect(dos.avisos.map((a) => a.tipo)).toEqual(["sms-lulo", "correo-lulo"]);
    expect(dos.comercio).toBe("Panaderia La Espiga");
  });

  it("se queda con el dato de crédito si alguno de los avisos lo trae", () => {
    const uno = cruzar(null, compra(37500, "08:12"), aviso("sms-lulo"), AHORA);
    const dos = cruzar(uno, { ...compra(37500, "08:12"), credito: true }, aviso("correo-lulo"), AHORA);
    expect(dos.credito).toBe(true);
  });

  it("no cuenta dos veces el mismo mensaje reenviado", () => {
    const uno = cruzar(null, compra(37500, "08:12"), aviso("sms-lulo", "idéntico"), AHORA);
    const dos = cruzar(uno, compra(37500, "08:12"), aviso("sms-lulo", "idéntico"), AHORA);
    expect(dos.avisos).toHaveLength(1);
  });

  it("no revive lo que ya guardaste o descartaste", () => {
    const guardado: Pendiente = { ...cruzar(null, compra(37500, "08:12"), aviso("sms-lulo"), AHORA), estado: "guardado" };
    const despues = cruzar(guardado, compra(37500, "08:12"), aviso("correo-lulo"), AHORA);
    expect(despues.estado).toBe("guardado");
    expect(despues.avisos).toHaveLength(2);
  });

  it("no une compras del mismo sitio con montos distintos", () => {
    const ids = [compra(22000, "18:51"), compra(65000, "18:54"), compra(14000, "19:21")].map(claveDe);
    expect(new Set(ids).size).toBe(3);
  });
});
