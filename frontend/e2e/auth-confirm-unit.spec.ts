import { test, expect } from "@playwright/test";
import {
  sanitizeNext,
  isAllowedOtpType,
  isValidInviteId,
  ALLOWED_OTP_TYPES,
  DEFAULT_NEXT,
} from "../src/lib/auth-confirm";

/**
 * Tests UNITARIOS puros del flujo token_hash (Sprint 13 · C1 y C2).
 * No requieren navegador ni build desplegado: validan la lógica anti-open-redirect,
 * la allowlist de tipos y la validación de invite_id. Siempre verdes en CI.
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

test.describe("isAllowedOtpType — sólo 'email' e 'invite'", () => {
  test("acepta 'email' (login) e 'invite' (invitación de agencia)", () => {
    expect(isAllowedOtpType("email")).toBe(true);
    expect(isAllowedOtpType("invite")).toBe(true);
  });

  test("la allowlist tiene EXACTAMENTE dos valores (no crece por accidente)", () => {
    expect([...ALLOWED_OTP_TYPES].sort()).toEqual(["email", "invite"]);
  });

  test("rechaza magiclink/recovery/signup/email_change y cualquier otro", () => {
    for (const t of [
      "magiclink",
      "recovery",
      "signup",
      "email_change",
      "email_change_current",
      "email_change_new",
      "sms",
      "phone_change",
      "foo",
      "EMAIL",
      "Invite",
      " invite",
      "",
      null,
      undefined,
      123,
      {},
    ]) {
      expect(isAllowedOtpType(t)).toBe(false);
    }
  });
});

test.describe("isValidInviteId — sólo UUID v4", () => {
  test("acepta UUID v4 canónicos (los que produce gen_random_uuid)", () => {
    expect(isValidInviteId("eb18a3f5-8636-4cd6-8622-e766575b9922")).toBe(true);
    expect(isValidInviteId("74d0dfa9-c3b4-49f6-aeac-7da8a5fbe3be")).toBe(true);
    // mayúsculas admitidas (case-insensitive)
    expect(isValidInviteId("EB18A3F5-8636-4CD6-8622-E766575B9922")).toBe(true);
  });

  test("rechaza UUID de otra versión y variantes inválidas", () => {
    // versión 1 (el dígito tras el 3er guion no es 4)
    expect(isValidInviteId("eb18a3f5-8636-1cd6-8622-e766575b9922")).toBe(false);
    // variante inválida (el dígito tras el 4to guion debe ser 8/9/a/b)
    expect(isValidInviteId("eb18a3f5-8636-4cd6-0622-e766575b9922")).toBe(false);
    // longitudes mal
    expect(isValidInviteId("eb18a3f5-8636-4cd6-8622-e766575b992")).toBe(false);
    expect(isValidInviteId("eb18a3f5-8636-4cd6-8622-e766575b99222")).toBe(false);
    expect(isValidInviteId("eb18a3f586364cd68622e766575b9922")).toBe(false);
  });

  test("rechaza vacío, no-string e intentos de inyección", () => {
    for (const v of [
      "",
      " ",
      null,
      undefined,
      0,
      {},
      [],
      "eb18a3f5-8636-4cd6-8622-e766575b9922 ",
      " eb18a3f5-8636-4cd6-8622-e766575b9922",
      "eb18a3f5-8636-4cd6-8622-e766575b9922'--",
      "eb18a3f5-8636-4cd6-8622-e766575b9922; drop table public.agency_invites;",
      "' or '1'='1",
      "../../etc/passwd",
      "<script>alert(1)</script>",
      "eb18a3f5-8636-4cd6-8622-e766575b9922\nX",
    ]) {
      expect(isValidInviteId(v)).toBe(false);
    }
  });
});
