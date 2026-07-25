import { test, expect } from "@playwright/test";

/**
 * Smoke E2E de superficie pública + guardas de auth.
 * Refleja el comportamiento verificado en prod el 2026-07-25.
 * No requiere sesión ni secretos.
 */

test.describe("Portal público", () => {
  test("home carga y muestra la marca", async ({ page }) => {
    const resp = await page.goto("/");
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(/GRUPO VALTERRA/i);
  });

  test("/propiedades lista propiedades y muestra los filtros", async ({ page }) => {
    await page.goto("/propiedades");
    await expect(page).toHaveTitle(/Propiedades/i);
    // Contador de resultados ("N propiedades disponibles")
    await expect(page.getByText(/propiedades?\s+disponibles?/i)).toBeVisible();
    // Filtros de operación / tipo / ciudad
    await expect(page.getByText(/Operaci[oó]n/i).first()).toBeVisible();
    await expect(page.getByText(/Ciudad/i).first()).toBeVisible();
    // Al menos una tarjeta de propiedad con precio
    await expect(page.getByText(/US\$|\$\s?\d/).first()).toBeVisible();
  });

  test("detalle de propiedad publicada carga con metadata y contacto", async ({ page }) => {
    const resp = await page.goto("/propiedades/casa-frente-rio-parana");
    expect(resp?.status()).toBeLessThan(400);
    // Título de la página incluye el nombre de la agencia (metadata SEO)
    await expect(page).toHaveTitle(/Grupo Valterra/i);
    // Canal de contacto presente (WhatsApp o formulario)
    await expect(page.getByText(/WhatsApp|Contact|Consult/i).first()).toBeVisible();
  });
});

test.describe("Guardas de acceso admin", () => {
  test("/admin/leads sin sesión redirige a login", async ({ page }) => {
    await page.goto("/admin/leads");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/Iniciar sesi[oó]n/i)).toBeVisible();
    await expect(page.getByText(/Magic link/i)).toBeVisible();
  });

  test("/admin/properties sin sesión redirige a login", async ({ page }) => {
    await page.goto("/admin/properties");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("SEO / infra pública", () => {
  test("robots.txt responde y bloquea /admin a crawlers", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body).toMatch(/Disallow:\s*\/admin/i);
  });

  test("sitemap.xml responde como XML", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body).toContain("<urlset");
  });

  test("/api/health responde ok", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBeLessThan(500);
  });
});
