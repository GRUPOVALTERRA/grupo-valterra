import { test, expect } from "@playwright/test";
import {
  cellSizeDegForZoom,
  clusterByGrid,
  isCluster,
  TARGET_CELL_PX,
  type ClusterableItem,
} from "../src/lib/map/cluster";
import { boundsOf, type MapPoint } from "../src/lib/map/types";
import { compactPrice } from "../src/lib/map/format";
import { buildMapWhatsappLink, mapWhatsappMessage } from "../src/lib/map/wa";
import { initialOf, isSafeLogoSrc, pinBadgeFor } from "../src/lib/map/badge";
import {
  hasAnyFilter,
  parseCity,
  parseOperation,
  parsePropertyType,
  parsePublicFilters,
  parseVista,
} from "../src/lib/public-filters";

/**
 * S26-MAP-01 — nucleo del mapa estrategico.
 * Unitarios puros: sin navegador, sin red, sin Supabase.
 */

const punto = (id: string, latitude: number, longitude: number): ClusterableItem => ({
  id,
  latitude,
  longitude,
});

test.describe("cluster · tamaño de celda", () => {
  test("al zoom 0 la celda cubre el ancho esperado del mundo", () => {
    expect(cellSizeDegForZoom(0)).toBeCloseTo((TARGET_CELL_PX * 360) / 256, 6);
  });

  test("cada nivel de zoom parte la celda al medio", () => {
    for (const z of [5, 10, 14]) {
      expect(cellSizeDegForZoom(z + 1)).toBeCloseTo(cellSizeDegForZoom(z) / 2, 10);
    }
  });

  test("entradas invalidas devuelven 0 (y el llamador no agrupa)", () => {
    expect(cellSizeDegForZoom(Number.NaN)).toBe(0);
    expect(cellSizeDegForZoom(-1)).toBe(0);
    expect(cellSizeDegForZoom(12, 0)).toBe(0);
  });
});

test.describe("cluster · agrupamiento", () => {
  test("lista vacia no produce grupos", () => {
    expect(clusterByGrid([], 0.01)).toEqual([]);
  });

  test("dos puntos de la misma cuadra se funden en un grupo con conteo", () => {
    const grupos = clusterByGrid(
      [punto("a", -27.4692, -58.8306), punto("b", -27.4694, -58.8309)],
      0.01,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items).toHaveLength(2);
    expect(isCluster(grupos[0])).toBe(true);
    // El globo se dibuja en el centroide, no en uno de los dos.
    expect(grupos[0].latitude).toBeCloseTo((-27.4692 + -27.4694) / 2, 10);
  });

  test("puntos lejanos quedan separados y CADA pin conserva su posicion exacta", () => {
    const a = punto("a", -27.4692, -58.8306); // Corrientes
    const b = punto("b", -27.3086, -58.5745); // Paso de la Patria
    const grupos = clusterByGrid([a, b], 0.01);
    expect(grupos).toHaveLength(2);
    for (const g of grupos) {
      expect(isCluster(g)).toBe(false);
      expect(g.latitude).toBe(g.items[0].latitude);
      expect(g.longitude).toBe(g.items[0].longitude);
    }
  });

  test("sin tamaño de celda utilizable NO se agrupa (fail-open)", () => {
    const items = [punto("a", -27.4, -58.8), punto("b", -27.4001, -58.8001)];
    for (const malo of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const grupos = clusterByGrid(items, malo);
      expect(grupos).toHaveLength(2);
      expect(grupos.every((g) => g.items.length === 1)).toBe(true);
    }
  });

  test("coordenadas no finitas se descartan", () => {
    const grupos = clusterByGrid(
      [punto("ok", -27.4, -58.8), punto("roto", Number.NaN, -58.8)],
      0.01,
    );
    expect(grupos.flatMap((g) => g.items.map((i) => i.id))).toEqual(["ok"]);
  });

  test("el resultado es determinista entre corridas", () => {
    const items = [
      punto("a", -27.47, -58.83),
      punto("b", -27.31, -58.57),
      punto("c", -27.4701, -58.8301),
    ];
    const uno = clusterByGrid(items, 0.01).map((g) => g.key);
    const dos = clusterByGrid([...items].reverse(), 0.01).map((g) => g.key);
    expect(uno).toEqual(dos);
  });
});

test.describe("encuadre", () => {
  const p = (id: string, lat: number, lng: number): MapPoint =>
    ({
      id,
      slug: id,
      title: id,
      price: 1,
      currency: "USD",
      operation: "venta",
      type: "casa",
      image: null,
      city: "Corrientes",
      latitude: lat,
      longitude: lng,
      location: { kind: "exact", point: { latitude: lat, longitude: lng } },
    }) as MapPoint;

  test("sin puntos no hay encuadre (quien renderiza decide el fallback)", () => {
    expect(boundsOf([])).toBeNull();
  });

  test("el encuadre cubre todos los puntos", () => {
    const b = boundsOf([p("a", -27.5, -58.9), p("b", -27.3, -58.5)]);
    expect(b).toEqual({ south: -27.5, west: -58.9, north: -27.3, east: -58.5 });
  });
});

test.describe("pastilla de precio", () => {
  test("abrevia sin exagerar y nunca hacia arriba", () => {
    expect(compactPrice(430000, "USD")).toBe("U$S 430 mil");
    expect(compactPrice(19000, "USD")).toBe("U$S 19 mil");
    expect(compactPrice(1500000, "USD")).toBe("U$S 1,5 M");
    expect(compactPrice(75000000, "ARS")).toBe("$ 75 M");
  });

  test("montos chicos se muestran completos (no se maquillan)", () => {
    expect(compactPrice(9500, "USD")).toBe("U$S 9.500");
    expect(compactPrice(200, "USD")).toBe("U$S 200");
  });

  test("sin precio cargado dice Consultar", () => {
    expect(compactPrice(0, "USD")).toBe("Consultar");
    expect(compactPrice(Number.NaN, "ARS")).toBe("Consultar");
  });
});

test.describe("WhatsApp del mapa", () => {
  const TITULO = "Casa premium con galpón de 257 m²";

  test("el mensaje es exactamente el aprobado por el titular", () => {
    expect(mapWhatsappMessage(TITULO)).toBe(
      `Vi esta propiedad ${TITULO} en Grupo Valterra, quisiera que me contacten. gracias`,
    );
  });

  test("va al WhatsApp de la agencia y lleva el titulo codificado", () => {
    const link = buildMapWhatsappLink(TITULO, "5493794656610");
    expect(link.startsWith("https://wa.me/5493794656610?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(mapWhatsappMessage(TITULO));
  });

  test("sin WhatsApp de agencia cae al numero general, nunca a vacio", () => {
    const link = buildMapWhatsappLink(TITULO);
    expect(link).toMatch(/^https:\/\/wa\.me\/\d{8,}\?text=/);
  });

  test("normaliza el numero a digitos", () => {
    expect(buildMapWhatsappLink(TITULO, "+54 9 379 465-6610")).toContain("wa.me/5493794656610?");
  });
});

test.describe("filtros publicos compartidos", () => {
  test("allowlist estricta: lo raro se ignora", () => {
    expect(parseOperation("venta")).toBe("venta");
    expect(parseOperation("permuta")).toBeUndefined();
    expect(parsePropertyType("terreno")).toBe("terreno");
    expect(parsePropertyType("castillo")).toBeUndefined();
    expect(parseOperation(["venta"])).toBeUndefined();
  });

  test("la ciudad se recorta y limita", () => {
    expect(parseCity("  Corrientes  ")).toBe("Corrientes");
    expect(parseCity("")).toBeUndefined();
    expect(parseCity("x".repeat(300))?.length).toBe(100);
  });

  test("la vista por defecto es lista", () => {
    expect(parseVista("mapa")).toBe("mapa");
    expect(parseVista("lista")).toBe("lista");
    expect(parseVista("cualquiera")).toBe("lista");
    expect(parseVista(undefined)).toBe("lista");
  });

  test("parsePublicFilters arma el objeto que consumen las dos vistas", () => {
    const f = parsePublicFilters({
      operationType: "alquiler",
      propertyType: "departamento",
      city: " Corrientes ",
      vista: "mapa",
    });
    expect(f).toEqual({
      operationType: "alquiler",
      propertyType: "departamento",
      city: "Corrientes",
    });
    expect(hasAnyFilter(f)).toBe(true);
    expect(hasAnyFilter({})).toBe(false);
  });
});

test.describe("insignia de agencia en el pin", () => {
  const SUPABASE = "https://rbjfvhtpytspaekvefng.supabase.co/storage/v1/object/public/properties/agency/x/logo/y.png";

  test("acepta solo https en hosts de la CSP o rutas propias", () => {
    expect(isSafeLogoSrc(SUPABASE)).toBe(true);
    expect(isSafeLogoSrc("/brand/logo.png")).toBe(true);
    expect(isSafeLogoSrc("//evil.example/logo.png")).toBe(false);
    expect(isSafeLogoSrc("http://rbjfvhtpytspaekvefng.supabase.co/x.png")).toBe(false);
    expect(isSafeLogoSrc("https://evil.example/x.png")).toBe(false);
    expect(isSafeLogoSrc("https://supabase.co/x.png")).toBe(false);
    expect(isSafeLogoSrc("https://user:pw@rbjfvhtpytspaekvefng.supabase.co/x.png")).toBe(false);
  });

  test("rechaza vectores de inyeccion aunque el host sea valido", () => {
    expect(isSafeLogoSrc('https://a.supabase.co/x.png" onerror="alert(1)')).toBe(false);
    expect(isSafeLogoSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeLogoSrc("data:image/png;base64,AAAA")).toBe(false);
    expect(isSafeLogoSrc("https://a.supabase.co/x.png<svg>")).toBe(false);
    expect(isSafeLogoSrc("")).toBe(false);
    expect(isSafeLogoSrc(null)).toBe(false);
  });

  test("la inicial ignora acentos y simbolos, y nunca queda vacia", () => {
    expect(initialOf("Ámbito Inmobiliaria")).toBe("A");
    expect(initialOf("  grupo valterra")).toBe("G");
    expect(initialOf("¡Ñandú!")).toBe("N");
    expect(initialOf("123 Propiedades")).toBe("1");
    expect(initialOf("***")).toBe("·");
    expect(initialOf(undefined)).toBe("·");
  });

  test("pinBadgeFor: logo invalido => inicial; sin agencia => punto medio", () => {
    expect(pinBadgeFor({ name: "Bañado Norte", logoUrl: "https://evil.example/x.png" })).toEqual({
      src: null,
      initial: "B",
    });
    expect(pinBadgeFor({ name: "MAS Servicios", logoUrl: SUPABASE })).toEqual({
      src: SUPABASE,
      initial: "M",
    });
    expect(pinBadgeFor(null)).toEqual({ src: null, initial: "·" });
  });
});
