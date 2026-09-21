import { describe, expect, it } from "vitest";
import { parseNotice } from "../src/parse";
import { parseAmount } from "../src/amount";

/**
 * The texts are each bank's real template with the values replaced: no amount,
 * merchant or card ending here belongs to anyone's purchase.
 */
const LULO_EMAIL = `Compra realizada
Realizaste una compra en PANADERIA LA ESPIGA por $37,500
Origen tarjeta de crédito •1234
Fecha 4 de marzo de 2026
Hora 8:12 a.m.`;

const LULO_SMS =
  "Lulo Bank: Compra realizada por $37,500 en PANADERIA LA ESPIGA con tu tarjeta terminada en  *1234. " +
  "Fecha 4 de marzo de 2026. Hora 8:12 a.m.";

const BOGOTA_SMS =
  "Banco de Bogota: Tu compra por 128,400 fue aprobada con Tarjeta Débito 5678 el 04/03/26 14:07:31 " +
  "en LIBRERIA NACIONAL BOGOTA ¿Dudas? Llama a la Servilinea ...";

const BOGOTA_PSE =
  "Tu pago por PSE fue aprobado el 2026/03/03 09:40:00 por valor de $61,200.00 Banco de Bogota, " +
  "si no realizaste esta compra comunicate a la servilinea.";

describe("parseAmount", () => {
  it("reads the comma as a thousands separator, the way banks write it", () => {
    expect(parseAmount("37,500")).toBe(37500);
    expect(parseAmount("1,234,567")).toBe(1234567);
    expect(parseAmount("$90,940")).toBe(90940);
  });

  it("lets the last separator win when both are present", () => {
    expect(parseAmount("61,200.00")).toBe(61200);
    expect(parseAmount("61.200,50")).toBe(61200.5);
  });

  it("still accepts the usual Colombian notation", () => {
    expect(parseAmount("90.940")).toBe(90940);
    expect(parseAmount("15000")).toBe(15000);
  });

  it("rejects what is not an amount", () => {
    expect(parseAmount("no es plata")).toBeNaN();
  });
});

describe("parseNotice", () => {
  it("reads the Lulo email and sees that the card is a credit card", () => {
    const r = parseNotice(LULO_EMAIL)!;
    expect(r.kind).toBe("lulo-email");
    expect(r.transaction).toEqual({
      amount: 37500,
      merchant: "Panaderia La Espiga",
      last4: "1234",
      date: "2026-03-04",
      time: "08:12",
      credit: true,
    });
  });

  it("reads the Lulo text message, which does not say whether it is credit", () => {
    const r = parseNotice(LULO_SMS)!;
    expect(r.kind).toBe("lulo-sms");
    expect(r.transaction).toMatchObject({ amount: 37500, last4: "1234", date: "2026-03-04", time: "08:12", credit: false });
  });

  it("reads the Banco de Bogotá message with its day-first date", () => {
    const r = parseNotice(BOGOTA_SMS)!;
    expect(r.kind).toBe("bogota-sms");
    expect(r.transaction).toEqual({
      amount: 128400,
      merchant: "Libreria Nacional Bogota",
      last4: "5678",
      date: "2026-03-04",
      time: "14:07",
      credit: false,
    });
  });

  // Banco de Bogotá's credit template has not been seen in a real message; this
  // only checks that the rule is not wired exclusively to the debit wording.
  it("marks it as credit when the Bogotá message says so", () => {
    const text = BOGOTA_SMS.replace("Tarjeta Débito", "Tarjeta Credito");
    expect(parseNotice(text)!.transaction.credit).toBe(true);
  });

  it("reads a PSE payment, which carries no merchant and no card", () => {
    const r = parseNotice(BOGOTA_PSE)!;
    expect(r.kind).toBe("bogota-pse");
    expect(r.transaction).toMatchObject({ amount: 61200, merchant: "Pago Pse", last4: null, date: "2026-03-03", time: "09:40" });
  });

  it("turns afternoon times into 24 hour", () => {
    expect(parseNotice(LULO_SMS.replace("8:12 a.m.", "8:12 p.m."))!.transaction.time).toBe("20:12");
    expect(parseNotice(LULO_SMS.replace("8:12 a.m.", "12:30 a.m."))!.transaction.time).toBe("00:30");
    expect(parseNotice(LULO_SMS.replace("8:12 a.m.", "12:30 p.m."))!.transaction.time).toBe("12:30");
  });

  it("ignores anything that is not a purchase", () => {
    const noise = [
      "Ingresa la clave 2492 para ver los datos de tu tarjeta. En Lulo bank nunca te pediremos que compartas este dato. Fecha 18 sept. 2026. Hora 6:03 p.m.",
      "Tu tarjeta de Banco de Bogota terminada en 5678 esta lista para Apple Pay. Puedes usarla cada vez que veas el simbolo de pago sin contacto.",
      "Aprovecha nuestras tasas preferenciales este mes.",
      "",
    ];
    for (const text of noise) expect(parseNotice(text)).toBeNull();
  });
});
