import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * S26 — smoke de NAVEGADOR del mapa estratégico (MAP-01/02) y del botón
 * flotante (MAP-03). Complementa las guardas estáticas y los tests puros
 * (map-core-unit, map-public-guard, agency-logo-unit): acá Leaflet corre de
 * verdad, con tiles de OSM bajo la CSP real y, en dev, React en modo estricto
 * (doble montaje: si el efecto de init no limpiara, "Map container is already
 * initialized" aparecería como pageerror).
 *
 * IMPORTANTE — separación por entorno (mismo patrón que auth-confirm):
 *  - Requiere un build QUE YA TENGA S26. Contra la producción anterior al
 *    merge /mapa no existe, por eso va GUARDADO tras E2E_MAP=1.
 *      PowerShell:  $env:E2E_MAP="1"; $env:BASE_URL="http://localhost:3000"
 *                   npx playwright test e2e/map-smoke.spec.ts --reporter=line
 *  - Después del merge: quitar la guarda (micro-PR de higiene) para que corra
 *    siempre contra producción como el resto del smoke.
 *
 * Depende de datos reales: al menos una propiedad publicada con ubicación
 * publicable. Si no hay ninguna, el mapa muestra el aviso y estos tests fallan
 * a propósito: un mapa vacío en producción es un incidente, no un caso borde.
 */

const MAP_ENABLED = process.env.E2E_MAP === "1";

/** Botón flotante (MAP-03): nombre accesible fijo. */
const FAB = 'a[aria-label="Ver el mapa de propiedades"]';
/** Tarjeta resumen: la única <article> con el link "Ver publicación de …". */
const CARD = 'article:has(a[aria-label^="Ver publicación de "])';
/** Contenedor que Leaflet crea al montar: prueba hidratación + import sin SSR. */
const LEAFLET = ".leaflet-container";

/** Mensaje aprobado por el titular (lib/map/wa.ts). Literal, con el título. */
const waMessage = (title: string) =>
  `Vi esta propiedad ${title} en Grupo Valterra, quisiera que me contacten. gracias`;

/** Si el encuadre inicial agrupa todo, acerca por clusters hasta ver un pin. */
async function revealPin(page: Page): Promise<Locator> {
  const pin = page.locator(".vt-pin").first();
  for (let i = 0; i < 5; i++) {
    if (await pin.isVisible().catch(() => false)) return pin;
    const cluster = page.locator(".vt-cluster").first();
    await expect(
      cluster,
      "sin pines ni clusters: ¿no hay propiedades publicadas con ubicación publicable?",
    ).toBeVisible();
    await cluster.click();
    // flyTo anima; recién en zoomend se reconstruyen los marcadores.
    await page.waitForTimeout(2000);
  }
  await expect(pin).toBeVisible();
  return pin;
}

test.describe("S26 · botón flotante Mapa (MAP-03)", () => {
  test.skip(!MAP_ENABLED, "Definí E2E_MAP=1 y BASE_URL a un build con S26");

  test("home: abajo a la derecha, fijo al scrollear, lleva a /mapa y ahí desaparece", async ({ page }) => {
    await page.goto("/");
    const fab = page.locator(FAB);
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute("href", "/mapa");
    await expect(fab).toHaveText(/Mapa/);

    const vp = page.viewportSize();
    const box = await fab.boundingBox();
    expect(vp).not.toBeNull();
    expect(box).not.toBeNull();
    // Esquina inferior derecha: borde derecho e inferior a ≤ 40 px del viewport.
    expect(vp!.width - (box!.x + box!.width)).toBeLessThanOrEqual(40);
    expect(vp!.height - (box!.y + box!.height)).toBeLessThanOrEqual(40);

    // position: fixed → misma posición después de scrollear.
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const after = await fab.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - box!.y)).toBeLessThanOrEqual(2);

    // Navega (transición cliente); en /mapa el botón no se muestra.
    await fab.click();
    await expect(page).toHaveURL(/\/mapa(\?|$)/);
    await expect(page.locator(LEAFLET)).toBeVisible();
    await expect(page.locator(FAB)).toHaveCount(0);
  });

  test("/propiedades (lista) lo muestra; /propiedades?vista=mapa no", async ({ page }) => {
    await page.goto("/propiedades");
    await expect(page.locator(FAB)).toBeVisible();

    await page.goto("/propiedades?vista=mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    await expect(page.locator(FAB)).toHaveCount(0);
  });

  test("no aparece en el login del panel (/admin/*)", async ({ page }) => {
    await page.goto("/admin/leads");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("button", { name: /link de acceso/i })).toBeVisible();
    await page.waitForFunction(() => document.readyState === "complete");
    await page.waitForTimeout(500);
    await expect(page.locator(FAB)).toHaveCount(0);
  });
});

test.describe("S26 · mapa estratégico (MAP-01/02)", () => {
  test.skip(!MAP_ENABLED, "Definí E2E_MAP=1 y BASE_URL a un build con S26");

  test("/mapa: Leaflet con pines, sin errores de página, sin CSP bloqueada y sin columnas internas en el HTML", async ({ page }) => {
    const pageErrors: string[] = [];
    const cspErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("console", (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Refused to (load|connect)/i.test(text)) cspErrors.push(text);
      else if (msg.type() === "error") console.log(`[map-smoke] console.error: ${text.slice(0, 300)}`);
    });

    const resp = await page.goto("/mapa");
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/mapa/i);
    await expect(page.getByRole("heading", { level: 1, name: /Mapa de propiedades/i })).toBeVisible();
    await expect(page.locator(LEAFLET)).toBeVisible();
    await expect(page.locator(".vt-pin, .vt-cluster").first()).toBeVisible();

    // CORE-GEO-01 · I2: el documento servido (HTML + payload RSC embebido) no
    // lleva las columnas internas `lat`/`lng`. Las públicas viajan como
    // latitude/longitude (GeoPoint), nunca con esos nombres.
    const html = await resp!.text();
    for (const col of ["lat", "lng"]) {
      expect(html, `columna interna "${col}" en el HTML de /mapa`).not.toContain(`"${col}":`);
      expect(html, `columna interna "${col}" en el payload RSC de /mapa`).not.toContain(`\\"${col}\\":`);
    }

    expect(pageErrors, "errores no capturados en /mapa").toEqual([]);
    expect(cspErrors, "bloqueos de CSP en /mapa").toEqual([]);
  });

  test("tiles de OpenStreetMap cargan (CSP img-src)", async ({ page }) => {
    await page.goto("/mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeAttached({ timeout: 20_000 });
  });

  test("clic en un pin: tarjeta con link a la publicación, WhatsApp con el mensaje aprobado, Escape cierra", async ({ page }) => {
    await page.goto("/mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();

    const pin = await revealPin(page);
    await pin.click();

    const card = page.locator(CARD);
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    // El pin seleccionado queda marcado por atributo (nunca se reconstruye).
    await expect(page.locator('.vt-pin[data-active="1"]')).toHaveCount(1);

    const publicacion = card.locator('a[href^="/propiedades/"]').first();
    const label = (await publicacion.getAttribute("aria-label")) ?? "";
    const title = label.replace(/^Ver publicación de /, "");
    expect(title.length).toBeGreaterThan(0);
    await expect(card.locator("h3")).toHaveText(title.trim());

    const wa = card.locator('a[href^="https://wa.me/"]').first();
    await expect(wa).toBeVisible();
    const url = new URL((await wa.getAttribute("href")) ?? "");
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toMatch(/^\/\d{8,15}$/);
    expect(url.searchParams.get("text")).toBe(waMessage(title));

    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });

  test("la lista comparte selección con el mapa: 'Ver … en el mapa' abre la tarjeta", async ({ page }) => {
    await page.goto("/mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    const btn = page.locator('button[aria-label^="Ver "][aria-label$=" en el mapa"]').first();
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.locator(CARD)).toHaveCount(1);
  });

  test("/propiedades?vista=mapa: mismo mapa, toggle Lista|Mapa vuelve a la grilla", async ({ page }) => {
    await page.goto("/propiedades?vista=mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    const mapa = page.getByRole("link", { name: "Mapa", exact: true });
    const lista = page.getByRole("link", { name: "Lista", exact: true });
    await expect(mapa).toHaveAttribute("aria-current", "page");
    await expect(lista).not.toHaveAttribute("aria-current", "page");

    await lista.click();
    await expect(page).toHaveURL(/\/propiedades(\?(?!.*vista=mapa)[^#]*)?$/);
    await expect(page.locator(LEAFLET)).toHaveCount(0);
    await expect(page.locator(FAB)).toBeVisible();
  });

  test("guard: /admin/agencia sin sesión redirige a login", async ({ page }) => {
    await page.goto("/admin/agencia");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("sitemap incluye /mapa", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    expect(r.status()).toBe(200);
    expect(await r.text()).toMatch(/<loc>[^<]*\/mapa<\/loc>/);
  });
});

test.describe("S26B · isotipo del portal y pantalla completa (MAP-04/05)", () => {
  test.skip(!MAP_ENABLED, "Definí E2E_MAP=1 y BASE_URL a un build con S26");

  test("pantalla completa: el boton expande el mapa a todo el viewport y Escape lo devuelve", async ({ page }) => {
    await page.goto("/mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    const btn = page.getByRole("button", { name: "Pantalla completa" });
    await expect(btn).toBeVisible();
    await btn.click();
    const wrap = page.locator('[data-map-fullscreen="1"]');
    await expect(wrap).toBeVisible();
    const vp = page.viewportSize();
    const box = await wrap.boundingBox();
    expect(vp).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(vp!.width);
    expect(Math.round(box!.height)).toBe(vp!.height);
    await expect(page.getByRole("button", { name: "Salir de pantalla completa" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-map-fullscreen="1"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pantalla completa" })).toBeVisible();
  });

  test("los pines de Grupo Valterra llevan el isotipo del kit", async ({ page }) => {
    await page.goto("/mapa");
    await expect(page.locator(LEAFLET)).toBeVisible();
    const isotipo = page.locator('.vt-badge img[src="/brand/isotipo-vt.svg"]');
    // Al encuadre inicial los pines de GV pueden estar agrupados: acercar por clusters.
    for (let i = 0; i < 4 && (await isotipo.count()) === 0; i++) {
      const cluster = page.locator(".vt-cluster").first();
      if ((await cluster.count()) === 0) break;
      await cluster.click();
      await page.waitForTimeout(2000);
    }
    await expect(isotipo.first()).toBeAttached();
  });
});
