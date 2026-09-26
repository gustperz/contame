import { beforeAll, describe, expect, it } from "vitest";
import CODE from "../apps-script/Code.js?raw";
import MANIFEST from "../apps-script/appsscript.json?raw";
import { assembleScript } from "../apps-script/assemble";
import { bundleMailboxLib } from "../build/mailbox";
import { htmlToText } from "../src/email";
import { emailFromGmail, type GmailPart } from "../src/gmail";
import { deliver, readEmail } from "../src/receiver";

const DEST = { url: "https://ejemplo.supabase.co/", key: "sb_publishable_x", token: "clave" };

const LULO_EMAIL_HTML = `<html><head><style>p{color:red}</style></head><body>
<table><tr><td><h1>Compra realizada</h1></td></tr>
<tr><td><p>Realizaste una compra en <b>PANADERIA LA ESPIGA</b> por $37,500</p>
<p>Origen tarjeta de cr&eacute;dito &bull;1234</p>
<p>Fecha 4 de marzo de 2026</p><p>Hora 8:12&nbsp;a.m.</p></td></tr></table></body></html>`;

/** Gmail's URL-safe base64, as the Gmail API returns bodies. */
const encode = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_");
const decode = (data: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** A Gmail API message as users.messages.get returns it, multipart/alternative inside multipart/mixed. */
function gmailMessage(opts: { from?: string; subject?: string; text?: string; html?: string }): { payload: GmailPart } {
  const alternative: GmailPart[] = [];
  if (opts.text !== undefined) alternative.push({ mimeType: "text/plain", body: { data: encode(opts.text) } });
  if (opts.html !== undefined) alternative.push({ mimeType: "text/html", body: { data: encode(opts.html) } });
  return {
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: opts.from ?? "Lulo Bank <notificaciones@lulobank.com>" },
        { name: "Subject", value: opts.subject ?? "Compra realizada" },
      ],
      parts: [{ mimeType: "multipart/alternative", parts: alternative }],
    },
  };
}

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
    expect(readEmail({ text: garbled, html: LULO_EMAIL_HTML }).parsed?.kind).toBe("lulo-email");
    expect(readEmail({ text: " hola ", html: "<p>otra</p>" })).toEqual({ text: "hola", parsed: null });
    expect(readEmail({})).toEqual({ text: "", parsed: null });
  });

  it("finds sender, subject and bodies inside a Gmail API message", () => {
    const email = emailFromGmail(gmailMessage({ text: "texto plano ñ", html: "<p>html ☕</p>" }), decode);
    expect(email).toEqual({ from: "Lulo Bank <notificaciones@lulobank.com>", subject: "Compra realizada", text: "texto plano ñ", html: "<p>html ☕</p>" });
    expect(emailFromGmail({ payload: { mimeType: "text/html", body: { data: encode("<b>solo</b>") } } }, decode)).toEqual({
      from: undefined,
      subject: undefined,
      html: "<b>solo</b>",
    });
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

  it("says why the server refused", async () => {
    const { fn } = fakeFetch({ message: "Clave del buzón inválida" }, 401);
    await expect(deliver({ text: "x" }, DEST, fn)).rejects.toThrow("Supabase respondió 401: Clave del buzón inválida");
  });
});

describe("the Apps Script project", () => {
  let lib = "";
  beforeAll(async () => {
    lib = await bundleMailboxLib();
  });

  it("asks only to read Gmail, call out, keep its own notes and schedule itself", () => {
    const manifest = JSON.parse(MANIFEST);
    expect(manifest.oauthScopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/script.external_request",
      "https://www.googleapis.com/auth/script.scriptapp",
      "https://www.googleapis.com/auth/script.storage",
    ]);
    expect(manifest.dependencies.enabledAdvancedServices).toEqual([{ userSymbol: "Gmail", serviceId: "gmail", version: "v1" }]);
    expect(CODE).not.toMatch(/GmailApp/);
  });

  /** Runs the pasted Code.gs against stand-ins for the Apps Script services. */
  function appsScript(inbox: Record<string, { payload: GmailPart }>, answer: (url: string, body: Record<string, unknown>) => [number, unknown]) {
    const props: Record<string, string> = {};
    const triggers: { handler: string; minutes: number }[] = [{ handler: "checkMail", minutes: 15 }, { handler: "otra", minutes: 60 }];
    const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const logs: string[] = [];
    const queries: string[] = [];
    const Gmail = {
      Users: {
        Messages: {
          list: (_me: string, opts: { q: string }) => {
            queries.push(opts.q);
            return { messages: Object.keys(inbox).map((id) => ({ id })) };
          },
          get: (_me: string, id: string) => inbox[id],
        },
      },
    };
    const UrlFetchApp = {
      fetch: (url: string, opts: { payload: string; headers: Record<string, string>; muteHttpExceptions: boolean }) => {
        expect(opts.muteHttpExceptions).toBe(true);
        const body = JSON.parse(opts.payload);
        sent.push({ url, body, headers: opts.headers });
        const [status, json] = answer(url, body);
        return { getResponseCode: () => status, getContentText: () => (json === undefined ? "" : JSON.stringify(json)) };
      },
    };
    const PropertiesService = {
      getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }),
    };
    const ScriptApp = {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, t })),
      deleteTrigger: (x: { t: (typeof triggers)[number] }) => triggers.splice(triggers.indexOf(x.t), 1),
      newTrigger: (handler: string) => ({
        timeBased: () => ({ everyMinutes: (minutes: number) => ({ create: () => triggers.push({ handler, minutes }) }) }),
      }),
    };
    const Utilities = {
      base64DecodeWebSafe: (data: string) => Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      newBlob: (bytes: Uint8Array) => ({ getDataAsString: () => new TextDecoder().decode(bytes) }),
    };
    const fakeConsole = { log: (m: string) => logs.push(m) };
    const source = assembleScript({ code: CODE, manifest: MANIFEST, lib }, { url: DEST.url, key: DEST.key, token: "ctm_prueba" });
    const run = new Function(
      "Gmail",
      "UrlFetchApp",
      "PropertiesService",
      "ScriptApp",
      "Utilities",
      "console",
      `${source}\nreturn { install: install, checkMail: checkMail };`,
    )(Gmail, UrlFetchApp, PropertiesService, ScriptApp, Utilities, fakeConsole) as { install: () => void; checkMail: () => void };
    return { run, props, triggers, sent, logs, queries, source };
  }

  it("installs itself every five minutes and sends each purchase once", () => {
    const inbox = {
      a1: gmailMessage({ html: LULO_EMAIL_HTML }),
      b2: gmailMessage({ subject: "Tu extracto", text: "Realizaste una compra... tu extracto de marzo" }),
    };
    const s = appsScript(inbox, (url) => (url.endsWith("receive_notice") ? [200, "new"] : [200, undefined]));
    s.run.install();
    expect(s.triggers).toEqual([{ handler: "otra", minutes: 60 }, { handler: "checkMail", minutes: 5 }]);
    expect(s.queries[0]).toBe('"Realizaste una compra" newer_than:3d');
    expect(s.sent.map((c) => c.url.split("/rpc/")[1])).toEqual(["receive_notice", "receive_unmatched"]);
    expect(s.sent[0].body).toMatchObject({ p_token: "ctm_prueba", p_item: { id: "1234|37500|2026-03-04|08:12", notice: { kind: "lulo-email" } } });
    expect(s.sent[0].headers).toMatchObject({ apikey: DEST.key });
    expect(s.logs).toEqual(["Compra en Panaderia La Espiga por 37500: new", "No es un aviso de compra: Tu extracto"]);

    s.run.checkMail();
    expect(s.sent).toHaveLength(2);
    expect(Object.keys(JSON.parse(s.props.seen))).toEqual(["a1", "b2"]);
  });

  it("stops at a refused key without marking the email as sent", () => {
    const s = appsScript({ a1: gmailMessage({ html: LULO_EMAIL_HTML }) }, () => [401, { message: "Clave del buzón inválida" }]);
    expect(() => s.run.checkMail()).toThrow("Supabase respondió 401: Clave del buzón inválida");
    expect(JSON.parse(s.props.seen ?? "{}")).toEqual({});
  });

  it("forgets emails older than the search window", () => {
    const s = appsScript({}, () => [200, "new"]);
    s.props.seen = JSON.stringify({ viejo: Date.now() - 6 * 86400000, nuevo: Date.now() - 86400000 });
    s.run.checkMail();
    expect(Object.keys(JSON.parse(s.props.seen))).toEqual(["nuevo"]);
  });

  it("is one readable file with the settings and key on top", () => {
    const { source } = appsScript({}, () => [200, "new"]);
    expect(source.split("\n")[0]).toBe("// Contame · buzón en Google Apps Script.");
    expect(source).toContain('"token": "ctm_prueba"');
    expect(source).toContain("var ContameMailbox");
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
  });
});
