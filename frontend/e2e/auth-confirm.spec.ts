import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E de ruta del flujo token_hash /auth/confirm (Sprint 13 · C1).
 *
 * IMPORTANTE — separación por entorno:
 *  - Los tests que golpean /auth/confirm requieren un build QUE YA TENGA el feature
 *    (rama feat/s13-tokenhash-magiclink). Contra producción actual la ruta no existe
 *    todavía, por eso van GUARDADOS tras E2E_CONFIRM=1 y NO corren en el CI de prod.
 *      Uso:  E2E_CONFIRM=1 BASE_URL=http://localhost:3000 npm run e2e
 *  - Los tests de /auth/callback y guardas corren siempre (validan que NO se rompió
 *    lo existente): callback intacto para invites, guard de /admin.
 *
 * Los escenarios con token_hash real tienen CUERPO REAL (no test.fixme) y se
 * separan por entorno:
 *  - GRUPO REAL-A (requiere Admin API): POST válido crea sesión · navegador limpio ·
 *    reuso falla → se OMITEN (skip) sin E2E_REAL_TOKEN + SUPABASE_SERVICE_ROLE_KEY + TEST_EMAIL.
 *  - GRUPO REAL-B (sin Service Role): token inválido/garbage falla → se OMITE (skip)
 *    sin E2E_CONFIRM=1 + E2E_SUPABASE_PUBLIC=1 (variables públicas Supabase).
 *  - Token REALMENTE VENCIDO: prueba MANUAL cronometrada (no automatizable de forma
 *    determinista; ver runbook §Plan-QA).
 */

const CONFIRM_ENABLED = process.env.E2E_CONFIRM === "1";

test.describe("Compatibilidad — NO se rompe lo existente (corre siempre)", () => {
  test("invite: /auth/callback sin code redirige a login (flujo invite intacto)", async ({ page }) => {
    const resp = await page.goto("/auth/callback");
    // Sin ?code el callback redirige a /admin/login?error=missing-code (comportamiento actual).
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(resp?.status()).toBeLessThan(400);
  });

  test("guard: /admin/leads sin sesión sigue redirigiendo a login", async ({ page }) => {
    await page.goto("/admin/leads");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/Iniciar sesi[oó]n/i)).toBeVisible();
  });
});

test.describe("token_hash /auth/confirm — requiere build con feature (E2E_CONFIRM=1)", () => {
  test.skip(!CONFIRM_ENABLED, "Definí E2E_CONFIRM=1 y BASE_URL a un build con el feature");

  test("escenario 6 — token_hash ausente → página 'inválido', no verifica", async ({ page }) => {
    await page.goto("/auth/confirm?type=email");
    await expect(page.getByText(/Link inv[aá]lido o incompleto/i)).toBeVisible();
    // No debe haber botón "Ingresar" (no hay token que confirmar).
    await expect(page.getByRole("button", { name: /Ingresar/i })).toHaveCount(0);
  });

  test("escenario 7 — type distinto de 'email' (magiclink, foo) → página 'inválido'", async ({ page }) => {
    for (const type of ["magiclink", "foo", "invite"]) {
      await page.goto(`/auth/confirm?token_hash=fake_hash_123&type=${type}`);
      await expect(page.getByText(/Link inv[aá]lido o incompleto/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Ingresar/i })).toHaveCount(0);
    }
  });

  test("escenario 8 — next externo se sanea a /admin/leads en el form", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=fake_hash_123&type=email&next=https://evil.com/admin");
    const nextVal = await page.locator('input[name="next"]').inputValue();
    expect(nextVal).toBe("/admin/leads");
  });

  test("escenario 1 — PREFETCH: GET con params válidos muestra botón y NO verifica ni crea sesión", async ({ page }) => {
    const resp = await page.goto("/auth/confirm?token_hash=fake_hash_123&type=email&next=/admin/properties");
    // GET responde 200 con el botón (no redirige, no consume token).
    expect(resp?.status()).toBe(200);
    await expect(page.getByRole("button", { name: /Ingresar/i })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/confirm/);
    // No debe setear cookie de sesión Supabase en un GET.
    const cookies = await page.context().cookies();
    const hasSession = cookies.some((c) => /sb-.*-auth-token/.test(c.name));
    expect(hasSession).toBe(false);
    // El form debe postear (POST-only) y preservar el next válido.
    await expect(page.locator("form")).toHaveCount(1);
    expect(await page.locator('input[name="next"]').inputValue()).toBe("/admin/properties");
  });

  test("hardening — headers no-store / no-referrer / noindex en /auth/confirm", async ({ request }) => {
    const r = await request.get("/auth/confirm?token_hash=x&type=email");
    expect((r.headers()["cache-control"] ?? "").toLowerCase()).toContain("no-store");
    expect((r.headers()["referrer-policy"] ?? "").toLowerCase()).toContain("no-referrer");
    expect((r.headers()["x-robots-tag"] ?? "").toLowerCase()).toContain("noindex");
  });
});

/**
 * Tests con verificación server-side. GUARDAS DE ENTORNO SEPARADAS:
 *
 *  GRUPO REAL-A (requiere Admin API) — genera un token_hash REAL:
 *    Requisitos: E2E_REAL_TOKEN=1 · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · TEST_EMAIL.
 *    Casos: (2) POST válido crea sesión · (3) navegador limpio funciona · (4) reuso falla.
 *
 *  GRUPO REAL-B (NO requiere Service Role) — token inválido/garbage:
 *    Requisitos: E2E_CONFIRM=1 · E2E_SUPABASE_PUBLIC=1 (build con NEXT_PUBLIC_SUPABASE_URL/ANON,
 *    Supabase alcanzable por la server action). NO usa SERVICE_ROLE ni TEST_EMAIL.
 *    Caso: (5a) token inválido → /admin/login?error=invalid-link.
 *
 *  (5b) token REALMENTE VENCIDO → MANUAL cronometrado (runbook, NO automatizado; no determinista en test).
 *
 * SEGURIDAD: el token_hash nunca se imprime ni se guarda. Email QA explícito (TEST_EMAIL);
 * generateLink('magiclink') asume usuario existente → no se crean usuarios; sesiones en
 * contextos efímeros de Playwright.
 */
const REAL_A = process.env.E2E_REAL_TOKEN === "1";
const REAL_B = process.env.E2E_CONFIRM === "1" && process.env.E2E_SUPABASE_PUBLIC === "1";
const SB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const QA_EMAIL = process.env.TEST_EMAIL ?? "";

/** Genera un token_hash real de magic link. NO imprime ni retorna el token en logs. */
async function genTokenHash(): Promise<string> {
  const admin = createClient(SB_URL, SB_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: QA_EMAIL,
  });
  if (error) throw new Error(`generateLink falló: ${error.message}`);
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("generateLink no devolvió hashed_token");
  return tokenHash; // uso interno; nunca se loguea
}

test.describe("REAL-A · token real (requiere Admin API)", () => {
  test.skip(!REAL_A, "Requiere E2E_REAL_TOKEN=1 (preview + Admin API)");
  test.skip(
    REAL_A && (!SB_URL || !SB_SERVICE || !QA_EMAIL),
    "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TEST_EMAIL",
  );

  test("2 — POST con token válido crea sesión (mismo navegador)", async ({ page, context }) => {
    const tokenHash = await genTokenHash();
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/admin/leads`);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/admin\/leads(\?|$|\/)/);
    const cookies = await context.cookies();
    expect(cookies.some((c) => /sb-.*-auth-token/.test(c.name))).toBe(true);
  });

  test("3 — mismo token en navegador LIMPIO funciona (sin code_verifier)", async ({ browser }) => {
    const tokenHash = await genTokenHash();
    // Contexto nuevo = sin ninguna cookie code_verifier: prueba la tesis multi-dispositivo.
    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      await p.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
      await p.getByRole("button", { name: /Ingresar/i }).click();
      await expect(p).toHaveURL(/\/admin\/leads(\?|$|\/)/);
    } finally {
      await ctx.close();
    }
  });

  test("4 — primer uso EXITOSO y luego segundo uso RECHAZADO", async ({ page, context, browser }) => {
    const tokenHash = await genTokenHash();

    // 1) PRIMER USO: debe ser EXITOSO — /admin/leads EXACTO + cookie de sesión presente.
    //    (No se acepta /admin/login: eso sería un falso verde con token que nunca funcionó.)
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/admin/leads`);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/admin\/leads(\?|$|\/)/);
    const firstCookies = await context.cookies();
    expect(firstCookies.some((c) => /sb-.*-auth-token/.test(c.name))).toBe(true);

    // 2) SEGUNDO USO del MISMO token en contexto LIMPIO: debe ser RECHAZADO.
    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      await p.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
      await p.getByRole("button", { name: /Ingresar/i }).click();
      await expect(p).toHaveURL(/\/admin\/login\?error=invalid-link/);
      const secondCookies = await ctx.cookies();
      expect(secondCookies.some((c) => /sb-.*-auth-token/.test(c.name))).toBe(false);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("REAL-B · token inválido (sin Service Role)", () => {
  test.skip(
    !REAL_B,
    "Requiere E2E_CONFIRM=1 + E2E_SUPABASE_PUBLIC=1 (build con NEXT_PUBLIC_SUPABASE_*). NO requiere SERVICE_ROLE ni TEST_EMAIL",
  );

  test("5a — token INVÁLIDO (garbage) → invalid-link, sin sesión", async ({ page, context }) => {
    await page.goto("/auth/confirm?token_hash=pkce_invalid_garbage_deadbeef&type=email");
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/admin\/login\?error=invalid-link/);
    const cookies = await context.cookies();
    expect(cookies.some((c) => /sb-.*-auth-token/.test(c.name))).toBe(false);
  });

  // 5b — token REALMENTE VENCIDO: NO automatizado (no determinista en test).
  //      Prueba MANUAL cronometrada → runbook §Plan-QA (NO AUTOMATIZADO).
});
