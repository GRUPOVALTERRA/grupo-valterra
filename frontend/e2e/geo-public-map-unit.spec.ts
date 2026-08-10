import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S18 PR3 — mapa público: guardas de privacidad y contrato.
 * Unitarios estáticos, sin navegador ni red.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test.describe("servicio público de ubicación", () => {
  const svc = read("services/property-public-location.ts");

  test("selecciona SOLO columnas public_* (nunca lat/lng internas)", () => {
    const cols = svc.match(/PUBLIC_GEO_COLUMNS =[\s\S]*?;/)?.[0] ?? "";
    expect(cols).toContain("public_location_mode");
    expect(cols).toContain("public_latitude");
    expect(cols).toContain("public_longitude");
    expect(cols).toContain("public_radius_m");
    expect(cols).not.toMatch(/[",]lat[,"]/);
    expect(cols).not.toMatch(/[",]lng[,"]/);
    // Y en todo el módulo tampoco hay lectura de las internas.
    expect(svc).not.toMatch(/\.lat\b/);
    expect(svc).not.toMatch(/\.lng\b/);
  });

  test("resuelve con CORE-GEO-01 y es fail-closed", () => {
    expect(svc).toContain('from "@/lib/geo/public-location"');
    expect(svc).toContain("resolvePublicLocation(");
    // Todos los caminos de error devuelven hidden.
    expect(svc.match(/return HIDDEN;/g)?.length).toBeGreaterThanOrEqual(4);
    expect(svc).toContain('kind: "hidden"');
  });

  test("solo lee propiedades publicadas y no expone detalles del proveedor", () => {
    expect(svc).toContain('.eq("published", true)');
    expect(svc).not.toMatch(/error\.message/);
  });
});

test.describe("componentes públicos de mapa", () => {
  const map = read("components/public/PropertyPublicMap.tsx");
  const block = read("components/public/PropertyLocationBlock.tsx");

  test("el mapa recibe SOLO PublicLocation (sin lat/lng sueltos)", () => {
    expect(map).toContain("PublicLocation");
    expect(map).not.toMatch(/props?\.(lat|lng)\b/);
    expect(map).not.toMatch(/internal/i);
    const props = map.match(/interface Props \{[\s\S]*?\}/)?.[0] ?? "";
    expect(props).toContain("location");
    expect(props).not.toMatch(/\blat\b|\blng\b/);
  });

  test("hidden no renderiza nada (ni contenedor ni coordenadas)", () => {
    expect(block).toMatch(/location\.kind === "hidden"\s*\)?\s*return null/);
  });

  test("approximate dibuja círculo y exact dibuja pin", () => {
    expect(map).toContain("L.circle(");
    expect(map).toContain("L.marker(");
    expect(map).toContain("location.radiusM");
  });

  test("Leaflet/OSM sin API key y con atribución obligatoria visible", () => {
    expect(map).toContain("tile.openstreetmap.org");
    expect(map).toContain("openstreetmap.org/copyright");
    expect(map).toContain("attributionControl: true");
    expect(map).not.toMatch(/api[_-]?key/i);
    expect(map).not.toMatch(/[?&](key|token|apikey)=/i);
  });

  test("la CSP permite los tiles (regresión: img-src los bloqueaba)", () => {
    const config = readFileSync(join(__dirname, "../next.config.ts"), "utf8");
    const imgSrc = config.match(/"img-src[^"]*"/)?.[0] ?? "";
    expect(imgSrc).toContain("tile.openstreetmap.org");
    // Y el host que usa el mapa debe estar cubierto por esa whitelist.
    const tileHost = map.match(/https:\/\/([a-z0-9.*-]+)\/\{z\}/)?.[1] ?? "";
    expect(imgSrc).toContain(tileHost);
  });

  test("carga dinámica sin SSR (Leaflet necesita window)", () => {
    expect(block).toContain('dynamic(');
    expect(block).toContain('import("@/components/public/PropertyPublicMap")');
    expect(map).toContain('"use client"');
  });

  test("aviso comercial presente (no reemplaza mensura/título/plano)", () => {
    expect(block).toContain("no reemplaza mensura");
  });
});

test.describe("invariante PR1 sigue vigente en la ficha", () => {
  test("el Property público no trae lat/lng y la página usa el servicio público", () => {
    const props = read("services/properties.ts");
    const columns = props.match(/const COLUMNS_BASE =[\s\S]*?;/)?.[0] ?? "";
    expect(columns).not.toMatch(/[",]lat[,"]/);
    expect(columns).not.toMatch(/[",]lng[,"]/);

    const page = read("app/propiedades/[slug]/page.tsx");
    expect(page).toContain("getPublicLocationByPropertyId(");
    expect(page).toContain("<PropertyLocationBlock");
    expect(page).not.toMatch(/property\.lat\b|property\.lng\b/);
  });
});
