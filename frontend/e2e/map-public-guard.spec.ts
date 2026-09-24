import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WA_SOURCES } from "../src/lib/events";
import { mapWhatsappMessage } from "../src/lib/map/wa";
import { shouldShowMapFab } from "../src/lib/map/fab";
import { PORTAL_BADGE_SRC } from "../src/lib/map/badge";
import { latestMigrationDefining, sqlOf } from "./fixtures/migrations";

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
// 0017 introdujo 'card-mapa'; la allowlist VIGENTE vive en la ULTIMA migracion
// que redefine el CHECK (OPS-09: antes se fijaba 0017 y 0018/0019 la dejaron roja).
const MIG_0017 = read("supabase/migrations/0017_site_events_source_mapa.sql");
const MIG_VIGENTE = latestMigrationDefining(ROOT, "site_events_source_check");
const FAB = read("src/components/layout/MapFab.tsx");
const LAYOUT = read("src/app/layout.tsx");
const BADGES = read("src/services/agency-badges.ts");
const FICHA_MAP = read("src/components/public/PropertyPublicMap.tsx");
const FICHA_PAGE = read("src/app/propiedades/[slug]/page.tsx");

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

  test("0017 introdujo 'card-mapa' en el CHECK real de la base", () => {
    const sql = sqlOf(MIG_0017);
    expect(sql).toContain("site_events_source_check");
    expect(sql).toContain("drop constraint if exists");
    expect(sql).toContain("'card-mapa'");
  });

  test("la ULTIMA migracion que redefine el CHECK contiene TODAS las fuentes", () => {
    // Contrato, no numero: no debe ponerse roja cuando exista 0020, 0021, ...
    expect(MIG_VIGENTE.file >= "0017").toBe(true);
    const sql = sqlOf(MIG_VIGENTE.sql);
    expect(sql).toContain("drop constraint if exists site_events_source_check");
    for (const source of WA_SOURCES) {
      expect(sql, `${MIG_VIGENTE.file} no incluye '${source}'`).toContain(`'${source}'`);
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

// ============================================================
// S26-MAP-03 · Boton flotante "Mapa" (decision del titular 13/09)
// ============================================================
test.describe("boton flotante Mapa", () => {
  test("se muestra en el sitio publico y nunca en admin, auth ni en el propio mapa", () => {
    expect(shouldShowMapFab("/", null)).toBe(true);
    expect(shouldShowMapFab("/propiedades", null)).toBe(true);
    expect(shouldShowMapFab("/propiedades/casa-x", null)).toBe(true);
    expect(shouldShowMapFab("/propiedades", "mapa")).toBe(false);
    expect(shouldShowMapFab("/mapa", null)).toBe(false);
    expect(shouldShowMapFab("/admin", null)).toBe(false);
    expect(shouldShowMapFab("/admin/leads", null)).toBe(false);
    expect(shouldShowMapFab("/auth/confirm", null)).toBe(false);
    expect(shouldShowMapFab(null, null)).toBe(false);
    // /administracion es publica: la regla es la misma que la analitica.
    expect(shouldShowMapFab("/administracion", null)).toBe(true);
  });

  test("es un link a /mapa, accesible, fijo abajo a la derecha, montado en el layout raiz", () => {
    expect(FAB).toContain('href="/mapa"');
    expect(FAB).toContain("aria-label=");
    expect(FAB).toMatch(/className="fixed right-/);
    expect(FAB).toContain("safe-area-inset-bottom");
    expect(LAYOUT).toContain("<MapFab />");
    expect(LAYOUT).toContain("<Suspense fallback={null}>");
    // La regla de visibilidad vive en un modulo puro y el componente la usa.
    expect(FAB).toContain('from "@/lib/map/fab"');
    expect(FAB).toContain("shouldShowMapFab(");
  });
});

// ============================================================
// S26B · MAP-04 insignia por defecto del portal · MAP-05 pantalla completa
// ============================================================

test.describe("insignia por defecto del portal (MAP-04)", () => {
  test("el servicio aplica el default SOLO via la funcion pura y con la agencia canonica", () => {
    expect(codigo(BADGES)).toContain(
      "effectiveAgencyLogo(row.slug, resolveAgencyLogoUrl(row.logo_url), CANONICAL_AGENCY_SLUG)",
    );
    expect(BADGES).toContain('from "@/services/agencies"');
    expect(BADGES).toContain('select("id, slug, name, logo_url")');
    // El perfil del admin distingue lo propio del default: sin eso "Quitar logo" apareceria sin logo.
    expect(BADGES).toContain("logoUrl: ownLogoUrl ?? portalDefaultUrl");
  });

  test("el isotipo del kit existe en los assets publicos del sitio", () => {
    expect(existsSync(join(ROOT, "public", PORTAL_BADGE_SRC))).toBe(true);
  });

  test("la ficha dibuja la insignia en el alfiler exacto, validada y escapada; la aproximada sigue sin marcador", () => {
    expect(FICHA_PAGE).toContain("getAgencyBadgeMap(");
    expect(FICHA_PAGE).toContain("pinBadgeFor(");
    expect(FICHA_PAGE).toContain("badge={agencyBadge}");
    const ficha = codigo(FICHA_MAP);
    expect(ficha).toContain('src="${escapeHtml(badge.src)}"');
    expect(ficha).toContain("escapeHtml(badge.initial)");
    expect((ficha.match(/L\.marker\(/g) ?? []).length).toBe(1);
    expect(ficha).toMatch(/kind === "exact"\) \{\s*L\.marker\(/);
  });
});

test.describe("pantalla completa (MAP-05)", () => {
  test("el mapa usa la regla pura de Escape y un control de Leaflet que no propaga clicks", () => {
    expect(MAP).toContain('from "@/lib/map/fullscreen"');
    expect(MAP_CODE).toContain(
      "escapeAction({ fullscreen: fullscreenRef.current, hasSelection: selectedRef.current !== null })",
    );
    expect(MAP_CODE).toContain("L.DomEvent.disableClickPropagation(bar)");
    expect(MAP_CODE).toContain('position: "topleft"');
  });

  test("a pantalla completa el contenedor cubre el viewport y la pagina no scrollea; al salir se restaura", () => {
    expect(MAP_CODE).toContain('fullscreen ? "fixed inset-0 z-[1400] bg-white"');
    expect(MAP_CODE).toContain('document.body.style.overflow = "hidden"');
    expect(MAP_CODE).toContain("document.body.style.overflow = prev");
    expect(MAP_CODE).toContain("data-map-fullscreen=");
  });

  test("el boton es accesible: etiqueta y estado presionado cambian con el modo", () => {
    expect(MAP_CODE).toContain('btn.setAttribute("aria-pressed", fullscreen ? "true" : "false")');
    expect(MAP_CODE).toContain('btn.setAttribute("aria-label", fullscreenLabel(fullscreen))');
  });
});
