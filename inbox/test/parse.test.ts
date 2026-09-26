import { describe, expect, it } from "vitest";
import { bogotaClock, parseNotice, readNotice } from "../src/parse";
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

// Email templates as text (after HTML is turned into text), values replaced too.
const PSE_EMAIL = `¡Hola, Nombre Apellido! Los siguientes son los datos de tu transacción:
Valor: $ 37.215,00
Empresa: COMUNICACION CELULAR COMCEL S.A.
Descripción: Pago por PSE
Fecha de la transacción: 03/03/2026
CUS: 555000111`;
const PSE_SUBJECT = "PSE - Transacción Aprobada ✅ CUS 555000111";

const NEQUI_BREB_EMAIL =
  "Enviaste de manera exitosa 7.500 a la llave 3009998877 de MARIA PEREZ el 4 de marzo de 2026 a la 1:05 p.m. Revisa el detalle...";

const NEQUI_BILL_EMAIL = `Listo tu pago en Claro Móvil
Pagaste con Nequi tu factura por $41.230.
Estado: Exitoso
Referencia: 00112233
Valor: $41.230
Fecha del pago: 05/Mar/2026`;

const BOGOTA_TRANSFER_SPELLED = `Comprobante de Transferencia
• Fecha y Hora: Marzo 4 del 2026 - 7:12 p. m.
• Cuenta Origen de Fondos: Cuenta Ahorros
• Cuenta Destino: 3009998877
• Monto: 12500
• Resultado: exitosa`;

const BOGOTA_TRANSFER_NUMERIC = `• Fecha y Hora: 2026-03-04 10:44:03
• Cuenta Origen de Fondos: NOMBRE Cuenta de Ahorros No. 9876
• Cuenta Destino: Cuenta de Ahorros No. 5432
• Monto: $ 1.250.000,00`;

const DAVIVIENDA_EMAIL =
  "DAVIVIENDA: Apreciado(a) NOMBRE: Le informamos que se ha registrado el siguiente movimiento de su Tarjeta Crédito terminada en ****4321: " +
  "Fecha: 2026/03/04 Hora: 07:50:51 Valor Transacción: 27,450 Clase de Movimiento: Compra . Respuesta: Aprobado(a) " +
  "Lugar de Transacción: RAPPI COLOMBIA*DL Atentamente, BANCO DAVIVIENDA S.A.";

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

  it("reads the amounts of the email templates", () => {
    expect(parseAmount("$ 37.215,00")).toBe(37215);
    expect(parseAmount("7.500")).toBe(7500);
    expect(parseAmount("$41.230")).toBe(41230);
    expect(parseAmount("$ 1.250.000,00")).toBe(1250000);
    expect(parseAmount("27,450")).toBe(27450);
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

describe("email templates", () => {
  // 2026-03-04 20:31 UTC is 15:31 on a Bogotá clock.
  const ARRIVED = Date.parse("2026-03-04T20:31:10Z");

  it("reads a Bogotá clock, which never changes for daylight saving", () => {
    expect(bogotaClock(ARRIVED)).toBe("15:31");
    expect(bogotaClock(Date.parse("2026-07-01T04:59:00Z"))).toBe("23:59");
  });

  it("reads a PSE payment, taking the time from when the email arrived", () => {
    const r = parseNotice(PSE_EMAIL, { subject: PSE_SUBJECT, receivedAt: ARRIVED })!;
    expect(r.kind).toBe("pse-email");
    expect(r.transaction).toEqual({ amount: 37215, merchant: "Comunicacion Celular Comcel", last4: null, date: "2026-03-03", time: "15:31", credit: false });
    // Without an arrival time (pasted text) it falls back to midnight.
    expect(parseNotice(PSE_EMAIL)!.transaction.time).toBe("00:00");
  });

  it("drops the company type from the PSE merchant", () => {
    const merchant = (company: string) => parseNotice(PSE_EMAIL.replace("COMUNICACION CELULAR COMCEL S.A.", company))!.transaction.merchant;
    expect(merchant("GASES DEL CARIBE S.A ESP")).toBe("Gases Del Caribe");
    expect(merchant("ACME COLOMBIA SAS")).toBe("Acme Colombia");
    expect(merchant("EMPRESA DE ACUEDUCTO E.S.P.")).toBe("Empresa De Acueducto");
    expect(merchant("MUEBLES LA CASA LTDA")).toBe("Muebles La Casa");
    expect(merchant("TIENDA NASA")).toBe("Tienda Nasa");
  });

  it("ignores a PSE payment that was declined", () => {
    expect(readNotice(PSE_EMAIL, { subject: "PSE - Transacción Rechazada ❌ CUS 555000111" })).toEqual({ status: "ignored" });
  });

  it("reads money sent from Nequi through Bre-B, with 'a la' and 'a las'", () => {
    const r = parseNotice(NEQUI_BREB_EMAIL, { subject: "¡Enviaste plata por Bre-B!" })!;
    expect(r.kind).toBe("nequi-breb-email");
    expect(r.transaction).toEqual({ amount: 7500, merchant: "Bre-B a Maria Perez", last4: null, date: "2026-03-04", time: "13:05", credit: false });
    const noon = NEQUI_BREB_EMAIL.replace("a la 1:05 p.m.", "a las 12:27 p.m.");
    expect(parseNotice(noon)!.transaction.time).toBe("12:27");
  });

  it("ignores money received through Bre-B, which is income", () => {
    const received = "Recibiste 7.500 de MARIA PEREZ en tu llave 3009998877 el 4 de marzo de 2026 a la 1:05 p.m.";
    expect(readNotice(received, { subject: "¡Recibiste plata por Bre-B!" })).toEqual({ status: "ignored" });
  });

  it("reads a bill paid with Nequi, with its short month and the arrival time", () => {
    const r = parseNotice(NEQUI_BILL_EMAIL, { subject: "Tu comprobante de pago Claro Móvil", receivedAt: ARRIVED })!;
    expect(r.kind).toBe("nequi-bill-email");
    expect(r.transaction).toEqual({ amount: 41230, merchant: "Claro Móvil", last4: null, date: "2026-03-05", time: "15:31", credit: false });
    expect(parseNotice(NEQUI_BILL_EMAIL.replace("05/Mar/2026", "16/Sep/2026"))!.transaction.date).toBe("2026-09-16");
    expect(parseNotice(NEQUI_BILL_EMAIL.replace("05/Mar/2026", "02/Aug/2026"))!.transaction.date).toBe("2026-08-02");
    expect(parseNotice(NEQUI_BILL_EMAIL.replace("05/Mar/2026", "02/Ago/2026"))!.transaction.date).toBe("2026-08-02");
  });

  it("takes the Nequi merchant from the subject when the body does not name it", () => {
    const body = NEQUI_BILL_EMAIL.replace("Listo tu pago en Claro Móvil\n", "");
    expect(parseNotice(body, { subject: "Tu comprobante de pago Gases del Caribe" })!.transaction.merchant).toBe("Gases Del Caribe");
    expect(readNotice(NEQUI_BILL_EMAIL.replace("Estado: Exitoso", "Estado: Rechazado"))).toEqual({ status: "ignored" });
  });

  it("reads a Banco de Bogotá transfer to a phone number, with 'p. m.' spaced out", () => {
    const r = parseNotice(BOGOTA_TRANSFER_SPELLED)!;
    expect(r.kind).toBe("bogota-transfer-email");
    expect(r.transaction).toEqual({ amount: 12500, merchant: "Transferencia a 3009998877", last4: null, date: "2026-03-04", time: "19:12", credit: false });
  });

  it("reads the numeric date of the other transfer receipt", () => {
    const text = BOGOTA_TRANSFER_NUMERIC.replace("Cuenta de Ahorros No. 5432", "00112233445");
    expect(parseNotice(text)!.transaction).toMatchObject({ amount: 1250000, date: "2026-03-04", time: "10:44", merchant: "Transferencia a 00112233445" });
  });

  it("leaves transfers between accounts for the person to look at, not as spending", () => {
    // Probably the person's own accounts: shown as unreadable, never turned into an expense.
    expect(readNotice(BOGOTA_TRANSFER_NUMERIC)).toEqual({ status: "unknown" });
    expect(readNotice(BOGOTA_TRANSFER_SPELLED.replace("3009998877", "@NEQUI3009998877"))).toEqual({ status: "unknown" });
    expect(readNotice(BOGOTA_TRANSFER_SPELLED.replace("exitosa", "rechazada"))).toEqual({ status: "ignored" });
  });

  it("reads a Davivienda credit card purchase", () => {
    const r = parseNotice(DAVIVIENDA_EMAIL, { subject: "DAVIVIENDA" })!;
    expect(r.kind).toBe("davivienda-email");
    expect(r.transaction).toEqual({ amount: 27450, merchant: "Rappi Colombia*dl", last4: "4321", date: "2026-03-04", time: "07:50", credit: true });
  });

  it("ignores declined Davivienda purchases and leaves other movements unread", () => {
    expect(readNotice(DAVIVIENDA_EMAIL.replace("Aprobado(a)", "Rechazado(a)"))).toEqual({ status: "ignored" });
    expect(readNotice(DAVIVIENDA_EMAIL.replace("Clase de Movimiento: Compra", "Clase de Movimiento: Pago"))).toEqual({ status: "unknown" });
  });

  it("does not mistake one template for another", () => {
    const kinds = [LULO_EMAIL, LULO_SMS, BOGOTA_SMS, BOGOTA_PSE, PSE_EMAIL, NEQUI_BREB_EMAIL, NEQUI_BILL_EMAIL, BOGOTA_TRANSFER_SPELLED, DAVIVIENDA_EMAIL].map(
      (t) => parseNotice(t)?.kind,
    );
    expect(kinds).toEqual([
      "lulo-email",
      "lulo-sms",
      "bogota-sms",
      "bogota-pse",
      "pse-email",
      "nequi-breb-email",
      "nequi-bill-email",
      "bogota-transfer-email",
      "davivienda-email",
    ]);
  });
});
