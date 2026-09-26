import { describe, expect, it } from "vitest";
import { bundleMailbox } from "../build/mailbox";
import { emailText, htmlToText } from "../src/email";
import { deliver } from "../src/receiver";

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

describe("email text", () => {
  it("turns the bank's HTML email into the text the templates expect", () => {
    const text = htmlToText(LULO_EMAIL_HTML);
    expect(text).toContain("Realizaste una compra en PANADERIA LA ESPIGA por $37,500");
    expect(text).toContain("Origen tarjeta de crédito •1234");
    expect(text).toContain("Hora 8:12 a.m.");
    expect(text).not.toContain("color:red");
  });

  it("prefers the plain text part when there is one", () => {
    expect(emailText({ text: " hola ", html: "<p>otra</p>" })).toBe("hola");
    expect(emailText({ html: "<p>solo&#36;html</p>" })).toBe("solo$html");
    expect(emailText({})).toBe("");
  });
});

describe("delivering to the inbox", () => {
  it("sends a purchase with its matching key and the original text", async () => {
    const { fn, calls } = fakeFetch("new");
    const result = await deliver({ text: htmlToText(LULO_EMAIL_HTML) }, DEST, fn);
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
    const result = await deliver({ text: "Confirma el reenvío: https://mail.google.com/...", sender: "forwarding-noreply@google.com", subject: "Confirmación" }, DEST, fn);
    expect(result).toEqual({ status: "unmatched" });
    expect(calls[0].url).toMatch(/rpc\/receive_unmatched$/);
    expect(calls[0].body).toMatchObject({ p_sender: "forwarding-noreply@google.com", p_subject: "Confirmación" });
  });

  it("says why the server refused", async () => {
    const { fn } = fakeFetch({ message: "Clave del buzón inválida" }, 401);
    await expect(deliver({ text: "x" }, DEST, fn)).rejects.toThrow("Supabase respondió 401: Clave del buzón inválida");
  });
});

describe("the Val Town file", () => {
  it("is one self-contained module that runs with just the settings on top", async () => {
    const code = await bundleMailbox();
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).toMatch(/export default|as default/);

    const calls: { url: string; body: unknown }[] = [];
    const logs: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const saved = { Deno: g.Deno, fetch: g.fetch };
    g.Deno = { env: { get: (n: string) => (n === "CONTAME_CLAVE" ? "clave" : undefined) } };
    g.fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify("merged"), { status: 200 });
    };
    const origLog = console.log;
    console.log = (m: string) => logs.push(m);
    try {
      const source = `const CONTAME = ${JSON.stringify({ url: DEST.url, key: DEST.key })};\n${code}`;
      const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`);
      await mod.default({ from: "notificaciones@lulobank.com", subject: "Compra realizada", html: LULO_EMAIL_HTML });
    } finally {
      console.log = origLog;
      g.Deno = saved.Deno;
      g.fetch = saved.fetch;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/rpc\/receive_notice$/);
    expect(logs[0]).toBe("Compra en Panaderia La Espiga por 37500: merged");
  });
});
