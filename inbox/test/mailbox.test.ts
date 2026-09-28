import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/email";
import { deliver, readEmail } from "../src/receiver";

const DEST = { url: "https://ejemplo.supabase.co/", key: "sb_publishable_x", token: "clave" };

const LULO_EMAIL_HTML = `<html><head><style>p{color:red}</style></head><body>
<table><tr><td><h1>Compra realizada</h1></td></tr>
<tr><td><p>Realizaste una compra en <b>PANADERIA LA ESPIGA</b> por $37,500</p>
<p>Origen tarjeta de cr&eacute;dito &bull;1234</p>
<p>Fecha 4 de marzo de 2026</p><p>Hora 8:12&nbsp;a.m.</p></td></tr></table></body></html>`;

/** A fetch that records calls and answers like PostgREST. */
function fakeFetch(answer: unknown = "new", status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return new Response(status === 204 ? null : JSON.stringify(answer), { status });
  };
  return { fn, calls };
}

describe("reading an email", () => {
  it("turns the bank's HTML email into the text the templates expect", () => {
    const text = htmlToText(LULO_EMAIL_HTML);
    expect(text).toContain("Realizaste una compra en PANADERIA LA ESPIGA por $37,500");
    expect(text).toContain("Origen tarjeta de crédito •1234");
    expect(text).toContain("Hora 8:12 a.m.");
    expect(text).not.toContain("color:red");
  });

  it("uses whichever version of the email matches a template", () => {
    const garbled = "Realizaste una compra en PANADERIA LA ESPIGA [imagen] ver en el navegador";
    expect(readEmail({ text: garbled, html: LULO_EMAIL_HTML }).reading).toMatchObject({ status: "purchase", kind: "lulo-email" });
    expect(readEmail({ text: " hola ", html: "<p>otra</p>" })).toEqual({ text: "hola", reading: { status: "unknown" } });
    expect(readEmail({})).toEqual({ text: "", reading: { status: "unknown" } });
  });
});

describe("delivering to the inbox", () => {
  it("sends a purchase with its matching key and the text it was read from", async () => {
    const { fn, calls } = fakeFetch("new");
    const result = await deliver({ html: LULO_EMAIL_HTML }, DEST, fn);
    expect(result).toEqual({ status: "new", merchant: "Panaderia La Espiga", amount: 37500 });
    expect(calls[0].url).toBe("https://ejemplo.supabase.co/rest/v1/rpc/receive_notice");
    expect(calls[0].headers).toMatchObject({ apikey: "sb_publishable_x", Authorization: "Bearer sb_publishable_x" });
    expect(calls[0].body).toMatchObject({
      p_token: "clave",
      p_item: { id: "1234|37500|2026-03-04|08:12", amount: 37500, last4: "1234", date: "2026-03-04", time: "08:12", credit: true, notice: { kind: "lulo-email" } },
    });
  });

  it("keeps anything else as an unreadable message", async () => {
    const { fn, calls } = fakeFetch(null, 204);
    const result = await deliver({ text: "Tu extracto está listo", from: "Lulo Bank", subject: "Extracto" }, DEST, fn);
    expect(result).toEqual({ status: "unmatched" });
    expect(calls[0].url).toMatch(/rpc\/receive_unmatched$/);
    expect(calls[0].body).toMatchObject({ p_sender: "Lulo Bank", p_subject: "Extracto", p_body: "Tu extracto está listo" });
  });

  it("sends nothing for an email that is known not to be spending", async () => {
    const { fn, calls } = fakeFetch();
    const received = { subject: "¡Recibiste plata por Bre-B!", text: "Recibiste 20.000 de NOMBRE APELLIDO el 22 de septiembre de 2026" };
    expect(await deliver(received, DEST, fn)).toEqual({ status: "ignored" });
    expect(calls).toHaveLength(0);
  });

  it("uses the arrival time for a PSE payment, which only carries the date", async () => {
    const { fn, calls } = fakeFetch("new");
    const pse = [
      "¡Hola, Nombre Apellido! Los siguientes son los datos de tu transacción:",
      "Valor: $ 61.250,00",
      "Empresa: GASES DEL CARIBE S.A ESP",
      "Descripción: Pago por PSE",
      "Fecha de la transacción: 24/09/2026",
      "CUS: 987654321",
    ].join("\n");
    // 2026-09-24 20:31 UTC is 15:31 in Bogotá.
    await deliver({ subject: "PSE - Transacción Aprobada ✅ CUS 987654321", text: pse, receivedAt: Date.parse("2026-09-24T20:31:10Z") }, DEST, fn);
    expect(calls[0].body).toMatchObject({ p_item: { id: "no-card|61250|2026-09-24|15:31", merchant: "Gases Del Caribe", time: "15:31", notice: { kind: "pse-email" } } });
  });

  it("says why the server refused", async () => {
    const { fn } = fakeFetch({ message: "Clave del buzón inválida" }, 401);
    await expect(deliver({ text: "x" }, DEST, fn)).rejects.toThrow("Supabase respondió 401: Clave del buzón inválida");
  });
});
