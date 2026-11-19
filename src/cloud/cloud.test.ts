import { describe, expect, it } from "vitest";
import { readCloudConfig } from "./config";
import { describeAuthError, looksLikeEmail } from "./errors";
import { parseEmailLink } from "./emailLink";
import { accessCode, parseAccessCode, readArrival } from "./handoff";

describe("readCloudConfig", () => {
  it("stays local-only when the build has no settings", () => {
    expect(readCloudConfig({})).toBeNull();
    expect(readCloudConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co" })).toBeNull();
    expect(readCloudConfig({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" })).toBeNull();
  });

  it("accepts a project url and key, dropping a trailing slash", () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co/", VITE_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_x " })).toEqual({
      url: "https://abc.supabase.co",
      key: "sb_publishable_x",
    });
  });

  it("rejects something that is not a bare origin", () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: "abc.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBeNull();
    expect(readCloudConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co/rest/v1", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBeNull();
  });
});

describe("describeAuthError", () => {
  it("explains the cases the person can do something about", () => {
    expect(describeAuthError({ status: 429, message: "email rate limit exceeded" })).toMatch(/hasta una hora/);
    expect(describeAuthError({ code: "otp_expired", message: "Token has expired or is invalid" })).toMatch(/venció/);
    expect(describeAuthError({ code: "email_address_invalid" })).toMatch(/no parece válido/);
    expect(describeAuthError({ code: "signup_disabled", message: "Signups not allowed for otp" })).toMatch(/no se pueden crear cuentas/);
    expect(describeAuthError(new TypeError("Failed to fetch"))).toMatch(/No pude conectarme/);
    expect(describeAuthError({ status: 500, code: "unexpected_failure", message: "Database error saving new user" })).toBe(
      "Este correo no tiene acceso a Contame.",
    );
  });

  it("falls back to the original message", () => {
    expect(describeAuthError({ message: "Something odd" })).toBe("Algo falló: Something odd");
    expect(describeAuthError(null)).toMatch(/Algo falló/);
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses and rejects obvious typos", () => {
    expect(looksLikeEmail("ana@correo.com")).toBe(true);
    expect(looksLikeEmail(" ana@correo.co ")).toBe(true);
    expect(looksLikeEmail("ana@correo")).toBe(false);
    expect(looksLikeEmail("ana correo.com")).toBe(false);
  });
});

describe("parseEmailLink", () => {
  const HASH = "pkce_4f1c8a9e2b7d6c5a3e1f0b9d8c7a6e5f";

  it("reads the link from Supabase's default email", () => {
    expect(parseEmailLink(`https://abc.supabase.co/auth/v1/verify?token=${HASH}&type=signup&redirect_to=http://localhost:3000`)).toEqual({
      tokenHash: HASH,
      type: "signup",
    });
    expect(parseEmailLink(`https://abc.supabase.co/auth/v1/verify?token=${HASH}&type=magiclink`)?.type).toBe("magiclink");
  });

  it("unwraps a link a mail app rewrote into its own redirect", () => {
    const inner = `https://abc.supabase.co/auth/v1/verify?token=${HASH}&type=email&redirect_to=http://localhost:3000`;
    const wrapped = `https://www.google.com/url?q=${encodeURIComponent(inner)}&sa=D&source=gmail`;
    expect(parseEmailLink(wrapped)).toEqual({ tokenHash: HASH, type: "email" });
  });

  it("falls back to a generic email type when the link does not say", () => {
    expect(parseEmailLink(`https://abc.supabase.co/auth/v1/verify?token=${HASH}`)?.type).toBe("email");
    expect(parseEmailLink(`https://abc.supabase.co/auth/v1/verify?token=${HASH}&type=nonsense`)?.type).toBe("email");
  });

  it("leaves codes and unrelated text alone", () => {
    expect(parseEmailLink("123456")).toBeNull();
    expect(parseEmailLink("https://contame.app/?foo=bar")).toBeNull();
    expect(parseEmailLink("token=corto")).toBeNull();
    expect(parseEmailLink("")).toBeNull();
  });
});

describe("an email link opened in the browser", () => {
  it("reads the session the link left in the address", () => {
    expect(readArrival("#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=r3fr3sh_tok-en&token_type=bearer&type=magiclink")).toEqual({ ok: true, accessToken: "aaa.bbb.ccc", refreshToken: "r3fr3sh_tok-en" });
    expect(readArrival("")).toBeNull();
    expect(readArrival("#seccion")).toBeNull();
  });

  it("explains a link that was already used", () => {
    expect(readArrival("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toMatchObject({ ok: false, message: expect.stringContaining("venció") });
  });

  it("hands the session over as a code the installed app recognises", () => {
    const code = accessCode("r3fr3sh_tok-en");
    expect(parseAccessCode(`  ${code}\n`)).toBe("r3fr3sh_tok-en");
    expect(parseAccessCode("123456")).toBeNull();
    expect(parseAccessCode("https://abc.supabase.co/auth/v1/verify?token=x")).toBeNull();
  });
});
