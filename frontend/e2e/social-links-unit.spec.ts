import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S16-SOCIAL — guardas estáticas de los enlaces sociales públicos.
 * Análisis estático puro: sin red, sin Supabase, sin navegador real.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const footer = () => read("components/layout/Footer.tsx");
const contact = () => read("components/home/ContactSection.tsx");
const social = () => read("lib/social.ts");
const socialLinks = () => read("components/layout/SocialLinks.tsx");

/** Únicas URLs sociales autorizadas a renderizarse (confirmadas por el dueño). */
const ALLOWED_URLS = [
  "https://www.facebook.com/profile.php?id=61593004700771",
  "https://www.instagram.com/grupovalterraar",
  "https://www.tiktok.com/@grupovalterra_ok",
  "https://x.com/grupovalterraar",
];

test.describe("enlaces sociales publicos", () => {
  test("1. sin enlaces placeholder href='#'", () => {
    expect(footer()).not.toContain('href="#"');
    expect(socialLinks()).not.toContain('href="#"');
  });

  test("2. sin domicilio fisico publicado", () => {
    for (const src of [footer(), contact(), social(), socialLinks()]) {
      expect(src).not.toContain("Catamarca 1365");
      expect(src).not.toContain("Dpto. I");
    }
  });

  test("3. sin email del dominio ajeno contacto@valterra.com.ar ni acceso@ como comercial", () => {
    for (const src of [footer(), contact(), socialLinks()]) {
      expect(src).not.toContain("contacto@valterra.com.ar");
      expect(src).not.toContain("mailto:acceso@grupovalterra.com.ar");
    }
  });

  test("4. enlaces externos con target _blank y rel noopener noreferrer", () => {
    const src = socialLinks();
    expect(src).toContain('target="_blank"');
    expect(src).toContain('rel="noopener noreferrer"');
  });

  test("5. aria-label presente en cada icono", () => {
    expect(socialLinks()).toContain("aria-label={`${s.name} de Grupo Valterra`}");
  });

  test("6. solo URLs sociales confirmadas en lib/social.ts", () => {
    const src = social();
    const urls = [...src.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(ALLOWED_URLS).toContain(u);
    // y ninguna URL http(s) fuera de la lista en el modulo
    const all = [...src.matchAll(/https?:\/\/[^\s"']+/g)].map((m) => m[0]);
    for (const u of all) expect(ALLOWED_URLS).toContain(u);
  });

  test("7. footer sin regresiones de S14-B/S15-A", () => {
    const src = footer();
    expect(src).not.toContain("CUIT");
    expect(src).not.toContain("Mat. CCIPER");
    expect(src).not.toContain("NewsletterForm");
    expect(src).not.toContain('href="#venta"');
    expect(src).not.toContain('href="#tasaciones"');
  });

  test("8. modulo social aislado de auth/supabase e invitaciones intactas", () => {
    // el modulo social no importa nada de auth ni supabase
    expect(social()).not.toContain("import");
    expect(socialLinks()).not.toContain("supabase");
    expect(socialLinks()).not.toContain("auth");
    // anclas de auth intactas
    expect(read("lib/auth-confirm.ts").length).toBeGreaterThan(0);
    expect(read("app/auth/confirm/page.tsx").length).toBeGreaterThan(0);
  });
});
