import { describe, expect, it } from "vitest";
import { leerAviso } from "../src/leer";
import { montoDe } from "../src/monto";

/**
 * Los textos son las plantillas reales de cada banco, con los valores
 * cambiados: ni los montos, ni los comercios, ni los últimos dígitos
 * corresponden a compras de nadie.
 */
const CORREO_LULO = `Compra realizada
Realizaste una compra en PANADERIA LA ESPIGA por $37,500
Origen tarjeta de crédito •1234
Fecha 4 de marzo de 2026
Hora 8:12 a.m.`;

const SMS_LULO =
  "Lulo Bank: Compra realizada por $37,500 en PANADERIA LA ESPIGA con tu tarjeta terminada en  *1234. " +
  "Fecha 4 de marzo de 2026. Hora 8:12 a.m.";

const SMS_BOGOTA =
  "Banco de Bogota: Tu compra por 128,400 fue aprobada con Tarjeta Débito 5678 el 04/03/26 14:07:31 " +
  "en LIBRERIA NACIONAL BOGOTA ¿Dudas? Llama a la Servilinea ...";

const PSE_BOGOTA =
  "Tu pago por PSE fue aprobado el 2026/03/03 09:40:00 por valor de $61,200.00 Banco de Bogota, " +
  "si no realizaste esta compra comunicate a la servilinea.";

describe("montoDe", () => {
  it("lee la coma como separador de miles, que es como escriben los bancos", () => {
    expect(montoDe("37,500")).toBe(37500);
    expect(montoDe("1,234,567")).toBe(1234567);
    expect(montoDe("$90,940")).toBe(90940);
  });

  it("con los dos separadores, el último manda", () => {
    expect(montoDe("61,200.00")).toBe(61200);
    expect(montoDe("61.200,50")).toBe(61200.5);
  });

  it("acepta también la forma colombiana de toda la vida", () => {
    expect(montoDe("90.940")).toBe(90940);
    expect(montoDe("15000")).toBe(15000);
  });

  it("rechaza lo que no es un monto", () => {
    expect(montoDe("no es plata")).toBeNaN();
  });
});

describe("leerAviso", () => {
  it("lee el correo de Lulo y reconoce que la tarjeta es de crédito", () => {
    const r = leerAviso(CORREO_LULO)!;
    expect(r.tipo).toBe("correo-lulo");
    expect(r.movimiento).toEqual({
      monto: 37500,
      comercio: "Panaderia La Espiga",
      last4: "1234",
      fecha: "2026-03-04",
      hora: "08:12",
      credito: true,
    });
  });

  it("lee el SMS de Lulo, que no dice si es crédito", () => {
    const r = leerAviso(SMS_LULO)!;
    expect(r.tipo).toBe("sms-lulo");
    expect(r.movimiento).toMatchObject({ monto: 37500, last4: "1234", fecha: "2026-03-04", hora: "08:12", credito: false });
  });

  it("lee el SMS de Banco de Bogotá con su fecha de día primero", () => {
    const r = leerAviso(SMS_BOGOTA)!;
    expect(r.tipo).toBe("sms-bogota");
    expect(r.movimiento).toEqual({
      monto: 128400,
      comercio: "Libreria Nacional Bogota",
      last4: "5678",
      fecha: "2026-03-04",
      hora: "14:07",
      credito: false,
    });
  });

  // La plantilla de crédito de Banco de Bogotá no la hemos visto en un mensaje
  // real; esto solo comprueba que la regla no se casa únicamente con "Débito".
  it("marca como crédito cuando el SMS de Bogotá lo dice", () => {
    const texto = SMS_BOGOTA.replace("Tarjeta Débito", "Tarjeta Credito");
    expect(leerAviso(texto)!.movimiento.credito).toBe(true);
  });

  it("lee un pago PSE, que no trae comercio ni tarjeta", () => {
    const r = leerAviso(PSE_BOGOTA)!;
    expect(r.tipo).toBe("pse-bogota");
    expect(r.movimiento).toMatchObject({ monto: 61200, comercio: "Pago Pse", last4: null, fecha: "2026-03-03", hora: "09:40" });
  });

  it("convierte la hora de la tarde a 24 horas", () => {
    expect(leerAviso(SMS_LULO.replace("8:12 a.m.", "8:12 p.m."))!.movimiento.hora).toBe("20:12");
    expect(leerAviso(SMS_LULO.replace("8:12 a.m.", "12:30 a.m."))!.movimiento.hora).toBe("00:30");
    expect(leerAviso(SMS_LULO.replace("8:12 a.m.", "12:30 p.m."))!.movimiento.hora).toBe("12:30");
  });

  it("ignora todo lo que no sea una compra", () => {
    const ruido = [
      "Ingresa la clave 2492 para ver los datos de tu tarjeta. En Lulo bank nunca te pediremos que compartas este dato. Fecha 18 sept. 2026. Hora 6:03 p.m.",
      "Tu tarjeta de Banco de Bogota terminada en 5678 esta lista para Apple Pay. Puedes usarla cada vez que veas el simbolo de pago sin contacto.",
      "Aprovecha nuestras tasas preferenciales este mes.",
      "",
    ];
    for (const texto of ruido) expect(leerAviso(texto)).toBeNull();
  });
});
