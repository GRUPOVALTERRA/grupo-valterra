import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Analítica F1 — guardas estáticas.
 * Todo link público de WhatsApp pasa por WaLink (evento wa_click);
 * el layout monta Vercel Analytics; el admin no se instrumenta.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const PUBLIC_WA_FILES = [
  "components/public/PublicPropertyCard.tsx",
  "components/home/PropertyCard.tsx",
  "components/home/CTASection.tsx",
  "components/layout/Footer.tsx",
  "app/propiedades/[slug]/page.tsx",
];

test.describe("wa_click — instrumentación", () => {
  test("WaLink es el único emisor y usa Vercel Analytics", () => {
    const wa = read("components/public/WaLink.tsx");
    expect(wa).toContain('from "@vercel/analytics"');
    expect(wa).toContain('track("wa_click"');
    expect(wa).toContain('"use client"');
    // Propiedades del evento: fuente + slug (sin PII).
    expect(wa).toContain("source");
    expect(wa).toContain("propertySlug");
  });

  for (const file of PUBLIC_WA_FILES) {
    test(`${file}: ningún <a> crudo hacia wa.me (todo via WaLink)`, () => {
      const src = read(file);
      // Ningún anchor nativo debe apuntar a wa.me: buscamos <a ... wa.me
      // dentro del mismo tag (heurística suficiente para estos archivos).
      const rawAnchor = /<a[^>]*href=\{?["'`]?https:\/\/wa\.me/;
      expect(src).not.toMatch(rawAnchor);
      // Y si el archivo construye waLink, debe usar WaLink.
      if (src.includes("wa.me")) expect(src).toContain("<WaLink");
    });
  }

  test("las superficies con propiedad envían el slug", () => {
    for (const f of [
      "components/public/PublicPropertyCard.tsx",
      "components/home/PropertyCard.tsx",
      "app/propiedades/[slug]/page.tsx",
    ]) {
      expect(read(f)).toContain("propertySlug={property.slug}");
    }
  });

  test("layout monta <Analytics /> de Vercel", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('from "@vercel/analytics/next"');
    expect(layout).toContain("<Analytics />");
  });

  test("el admin no se instrumenta con wa_click", () => {
    const leadTable = read("components/admin/leads/LeadTable.tsx");
    expect(leadTable).not.toContain("WaLink");
    expect(leadTable).not.toContain("wa_click");
  });
});
