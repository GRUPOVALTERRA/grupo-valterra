import { test, expect } from "@playwright/test";
import { sanitizeNext, isAllowedOtpType, DEFAULT_NEXT } from "../src/lib/auth-confirm";

/**
 * Tests UNITARIOS puros del flujo token_hash (Sprint 13 · C1).
 * No requieren navegador ni build desplegado: validan la lógica anti-open-redirect
 * y la allowlist de tipos. Siempre verdes en CI.
 */

const ORIGIN = "https://grupo-valterra.vercel.app";

test.describe("sanitizeNext — open-redirect guard", () => {
  test("acepta rutas /admin relativas y absolutas del mismo origin", () => {
    expect(sanitizeNext("/admin/leads", ORIGIN)).toBe("/admin/leads");
    expect(sanitizeNext("/admin/properties", ORIGIN)).toBe("/admin/properties");
    expect(sanitizeNext("/admin", ORIGIN)).toBe("/admin");
    expect(sanitizeNext(`${ORIGIN}/admin/leads`, ORIGIN)).toBe("/admin/leads");
    expect(sanitizeNext(`${ORIGIN}/admin/leads?tab=new`, ORIGIN)).toBe("/admin/leads?tab=new");
  });

  test("bloquea vacío, loop de login y no-admin", () => {
    expect(sanitizeNext("", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext(null, ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext(undefined, ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/admin/login", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/admin/login?x=1", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/propiedades", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/", ORIGIN)).toBe(DEFAULT_NEXT);
  });

  test("bloquea open-redirect externo y trucos de path", () => {
    expect(sanitizeNext("https://evil.com/admin", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("//evil.com/admin", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("https://grupo-valterra.vercel.app.evil.com/admin", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/admin/../propiedades", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/administrador", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("/\\evil.com", ORIGIN)).toBe(DEFAULT_NEXT);
    expect(sanitizeNext("javascript:alert(1)", ORIGIN)).toBe(DEFAULT_NEXT);
  });
});

test.describe("isAllowedOtpType — solo 'email'", () => {
  test("acepta únicamente 'email' (login por email)", () => {
    expect(isAllowedOtpType("email")).toBe(true);
  });

  test("rechaza magiclink/recovery/signup/email_change/invite y cualquier otro", () => {
    for (const t of [
      "magiclink",
      "recovery",
      "signup",
      "email_change",
      "invite",
      "sms",
      "phone_change",
      "foo",
      "",
      null,
      undefined,
    ]) {
      expect(isAllowedOtpType(t)).toBe(false);
    }
  });
});
