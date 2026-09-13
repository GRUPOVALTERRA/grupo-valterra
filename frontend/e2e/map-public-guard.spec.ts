import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WA_SOURCES } from "../src/lib/events";
import { mapWhatsappMessage } from "../src/lib/map/wa";

/**
 * S26-MAP-01 — guardas estaticas del mapa estrategico.
 *
 * Las tres guardas del gate (G1 privacidad, G2 mensaje de WhatsApp,
 * G3 espejo de allowlists) mas las que cubren los invariantes I2/I4.
 * Cada una se prueba con MUTACION documentada en el PR: una guarda que
 * solo mira posiciones de texto ya dio tres falsos verdes en este repo.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Codigo ejecutable: sin comentarios (que documentan justamente lo que NO se hace). */
const codigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

const SVC = read("src/services/property-map.ts");
const TYPES = read("src/lib/map/types.ts");
const MAP = read("src/components/public/PropertiesMap.tsx");
const CARD = read("src/components/public/MapPropertyCard.tsx");
const VIEW = read("src/components/public/PropertiesMapView.tsx");
const WALINK = read("src/components/public/WaLink.tsx");
const PAGE = read("src/app/mapa/page.tsx");
const LISTADO = read("src/app/propiedades/page.tsx");
const MIG = read("supabase/migrations/0017_site_events_source_mapa.sql");

const SVC_CODE = codigo(SVC);
const MAP_CODE = codigo(MAP);
const CARD_CODE = codigo(CARD);

// ============================================================
// G1 · Privacidad: el mapa lee SOLO columnas publicables
// ============================================================
test.describe("G1 · el servicio del mapa no puede filtrar ubicacion interna", () => {
  const cols = SVC.match(/MAP_COLUMNS =[\s\S]*?;/)?.[0] ?? "";

  test("el SELECT pide las cuatro columnas public_* y ninguna interna", () => {
    expect(cols).toContain("public_location_mode");
    expect(cols).toContain("public_latitude");
    expect(cols).toContain("public_longitude");
    expect(cols).toContain("public_radius_m");
    expect(cols).not.toMatch(/[",]lat[,"]/);
    expect(cols).not.toMatch(/[",]lng[,"]/);
  });

  test("tampoco pide el domicilio: lo que no se consulta no se filtra", () => {
    expect(cols).not.toContain("address");
  });

  test("el modulo entero no lee las coordenadas internas", () => {
    expect(SVC_CODE).not.toMatch(/\.lat\b/);
    expect(SVC_CODE).not.toMatch(/\.lng\b/);
    expect(SVC_CODE).not.toMatch(/row\.lat/);
  });

  test("el componente de mapa no habla con la base ni conoce columnas crudas", () => {
    expect(MAP_CODE).not.toContain("@/lib/supabase");
    expect(MAP_CODE).not.toMatch(/public_latitude|public_longitude|public_radius_m/);
  });
});

// ============================================================
// G2 · Mensaje de WhatsApp aprobado por el titular
// ============================================================
test.describe("G2 · el mensaje de WhatsApp del mapa es el aprobado", () => {
  test("texto exacto, con el titulo de la propiedad", () => {
    expect(mapWhatsappMessage("Lote 51")).toBe(
      "Vi esta propiedad Lote 51 en Grupo Valterra, quisiera que me contacten. gracias",
    );
  });

  test("la tarjeta arma el link por el modulo, nunca a mano", () => {
    expect(CARD).toContain("buildMapWhatsappLink(");
    expect(CARD_CODE).not.toMatch(/wa\.me/);
    expect(CARD_CODE).not.toContain("encodeURIComponent");
  });

  test("el click se emite por WaLink (unico emisor de wa_click) con la fuente del mapa", () => {
    expect(CARD).toContain("<WaLink");
    expect(CARD).toContain('source="card-mapa"');
    expect(CARD).toContain("propertySlug={property.slug}");
  });
});

// ============================================================
// G3 · Espejo de allowlists: codigo, tipo y base
// ============================================================
test.describe("G3 · las tres allowlists de `source` dicen lo mismo", () => {
  const union = WALINK.match(/export type WaSource =[\s\S]*?;/)?.[0] ?? "";
  const enWaLink = [...union.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();

  test("WaSource (componente) === WA_SOURCES (validador del backend)", () => {
    expect(enWaLink.length).toBeGreaterThan(0);
    expect(enWaLink).toEqual([...WA_SOURCES].slice().sort());
  });

  test("la fuente del mapa existe en el codigo", () => {
    expect([...WA_SOURCES]).toContain("card-mapa");
  });

  test("la migracion 0017 amplia el CHECK real de la base con TODAS las fuentes", () => {
    expect(MIG).toContain("site_events_source_check");
    expect(MIG).toContain("drop constraint if exists");
    for (const source of WA_SOURCES) {
      expect(MIG).toContain(`'${source}'`);
    }
  });
});

// ============================================================
// I2 · Fail-closed: una propiedad oculta no se dibuja
// ============================================================
test.describe("I2 · lo que no tiene ubicacion publicable no se dibuja", () => {
  test("el tipo del punto excluye `hidden` por construccion", () => {
    expect(TYPES).toContain('Exclude<PublicLocation, { kind: "hidden" }>');
  });

  test("el servicio resuelve con CORE-GEO-01 y separa las ocultas", () => {
    expect(SVC).toContain('from "@/lib/geo/public-location"');
    expect(SVC).toContain("resolvePublicLocation(");
    expect(SVC).toContain('location.kind === "hidden"');
    expect(SVC).toContain("withoutLocation.push(base)");
  });

  test("el mapa nunca inventa propiedades de muestra", () => {
    expect(SVC_CODE).not.toContain("MOCK_PROPERTIES");
    expect(SVC_CODE).not.toContain("sampleFallback");
    expect(SVC).toContain('.eq("published", true)');
  });
});

// ============================================================
// I4 · El mapa no esconde stock
// ============================================================
test.describe("I4 · las propiedades sin ubicacion se listan igual", () => {
  test("la vista recibe y lista el conjunto sin ubicacion", () => {
    expect(VIEW).toContain("withoutLocation");
    expect(VIEW).toContain("Sin ubicación publicada");
  });

  test("esas filas igual enlazan a su publicacion", () => {
    expect(VIEW).toContain("/propiedades/${item.slug}");
  });
});

// ============================================================
// Higiene del render del mapa
// ============================================================
test.describe("render del mapa", () => {
  const iconos =
    (MAP.match(/function priceIcon[\s\S]*?\n}/)?.[0] ?? "") +
    (MAP.match(/function clusterIcon[\s\S]*?\n}/)?.[0] ?? "");

  test("por innerHTML solo viaja texto escapado, nunca datos libres", () => {
    expect(iconos).toContain("escapeHtml(");
    expect(iconos).not.toMatch(/title|slug|neighborhood|description|address/);
  });

  test("el logo del pin pasa por el validador y se escapa como atributo", () => {
    // S26-MAP-02: la URL la cargo un owner => hostil hasta que pinBadgeFor la valide.
    expect(MAP).toContain('from "@/lib/map/badge"');
    expect(MAP_CODE).toContain("pinBadgeFor(");
    expect(iconos).toContain("escapeHtml(badge.src)");
    expect(iconos).toContain("escapeHtml(badge.initial)");
    // Ningun camino arma el <img> con la URL cruda.
    expect(iconos).not.toMatch(/src="\$\{badge\.src\}/);
    expect(iconos).not.toMatch(/logoUrl/);
  });

  test("tiles OSM sin API key y con atribucion obligatoria", () => {
    expect(MAP).toContain("tile.openstreetmap.org");
    expect(MAP).toContain("openstreetmap.org/copyright");
    expect(MAP).toContain("attributionControl: true");
    expect(MAP_CODE).not.toMatch(/api[_-]?key/i);
  });

  test("el circulo del modo aproximado sigue existiendo", () => {
    expect(MAP).toContain("L.circle(");
    expect(MAP).toContain("location.radiusM");
  });

  test("control cruzado A1: el encuadre espera tamaño real y la seleccion panea", () => {
    // Montado oculto (toggle movil) Leaflet encuadra con 0x0 px: zoom absurdo.
    expect(MAP).toContain("if (!map || !sizeReady) return;");
    expect(MAP).toContain("}, [boundsKey, sizeReady]);");
    expect(MAP).toContain("map.panTo(");
  });

  test("control cruzado M1: hover/seleccion NO reconstruyen los marcadores", () => {
    // Safari iOS cancela el click del toque si el DOM bajo el dedo cambia.
    expect(MAP).toContain("}, [points, zoom, badgesByAgency]);");
    expect(MAP).toContain('setAttribute("data-active"');
    expect(MAP_CODE).not.toMatch(/\[points, zoom, selectedId, hoveredId/);
  });

  test("control cruzado M2: pines operables por teclado y tarjeta cerrable con Escape", () => {
    expect(MAP).toContain('marker.on("keydown"');
    expect(MAP).toContain("keyboard: true");
    expect(CARD).toContain('e.key === "Escape"');
  });
});

// ============================================================
// Rutas: una sola implementacion para las dos superficies
// ============================================================
test.describe("rutas del mapa", () => {
  test("/mapa monta la vista compartida y declara su canonical", () => {
    expect(PAGE).toContain('canonical: "/mapa"');
    expect(PAGE).toContain("PropertiesMapView");
    expect(PAGE).toContain("getMapProperties");
  });

  test("/propiedades ofrece la vista mapa con el mismo parser de filtros", () => {
    expect(LISTADO).toContain("parseVista");
    expect(LISTADO).toContain("PropertiesMapView");
    expect(LISTADO).toContain("parsePublicFilters");
  });
});
