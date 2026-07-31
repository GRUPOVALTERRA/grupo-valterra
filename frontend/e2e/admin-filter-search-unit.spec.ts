import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

/**
 * Sprint 15-B — filtro por estado y búsqueda del listado administrativo.
 *
 * Unitarios puros sobre la normalización y el armado del filtro, más guardas de
 * análisis estático que fijan dónde ocurre el filtrado: en la base y con el
 * scope puesto, nunca recortando en el cliente una lista ya traída entera.
 * Sin navegador, sin red, sin Supabase.
 */

const SRC = join(__dirname, "../src");
const require_ = Module.createRequire(__filename);
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Código sin comentarios: las menciones documentales no cuentan. */
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const search = () => require_("../src/lib/property-search.ts");

/* ---------- normalización del término ---------- */

test.describe("termino de busqueda", () => {
  test("recorta espacios y colapsa los repetidos", () => {
    const { normalizeSearchTerm } = search();
    expect(normalizeSearchTerm("  casa   parana  ")).toBe("casa parana");
  });

  test("vacio, en blanco o no-string es 'sin busqueda'", () => {
    const { normalizeSearchTerm } = search();
    expect(normalizeSearchTerm("")).toBeUndefined();
    expect(normalizeSearchTerm("    ")).toBeUndefined();
    expect(normalizeSearchTerm(undefined)).toBeUndefined();
    // una query repetida (?q=a&q=b) llega como array: no se busca por ella
    expect(normalizeSearchTerm(["casa", "depto"])).toBeUndefined();
  });

  test("un termino desmedido queda acotado", () => {
    const { normalizeSearchTerm, SEARCH_MAX_LENGTH } = search();
    const term = normalizeSearchTerm("a".repeat(SEARCH_MAX_LENGTH + 500));
    expect(term).toHaveLength(SEARCH_MAX_LENGTH);
  });
});

/* ---------- match en memoria ---------- */

test.describe("coincidencia en memoria", () => {
  const property = {
    title: "Casa premium frente al río Paraná",
    slug: "casa-premium-frente-al-rio-parana",
    city: "Paraná",
    neighborhood: "Costa del Paraná",
    province: "Entre Ríos",
  };

  test("ignora acentos y mayusculas", () => {
    const { matchesSearch } = search();
    expect(matchesSearch(property, "parana")).toBe(true);
    expect(matchesSearch(property, "PREMIUM")).toBe(true);
    expect(matchesSearch(property, "río")).toBe(true);
  });

  test("busca por titulo, slug, ciudad y barrio", () => {
    const { matchesSearch } = search();
    expect(matchesSearch({ title: "Depto centro" }, "centro")).toBe(true);
    expect(matchesSearch({ slug: "depto-centro-2" }, "centro-2")).toBe(true);
    expect(matchesSearch({ city: "Corrientes" }, "corrien")).toBe(true);
    expect(matchesSearch({ neighborhood: "Villa Urquiza" }, "urquiza")).toBe(true);
  });

  test("no inventa coincidencias por campos que no se buscan", () => {
    const { matchesSearch } = search();
    // provincia no es un campo buscable: no debe traer la ficha
    expect(matchesSearch(property, "entre rios")).toBe(false);
    expect(matchesSearch(property, "chalet")).toBe(false);
  });

  test("campos ausentes no rompen la comparacion", () => {
    const { matchesSearch } = search();
    expect(matchesSearch({ title: "Casa", city: null, neighborhood: undefined }, "casa")).toBe(true);
    expect(matchesSearch({}, "casa")).toBe(false);
  });
});

/* ---------- filtro que viaja a PostgREST ---------- */

test.describe("filtro ilike", () => {
  test("el termino va entrecomillado y con las barras escapadas", () => {
    const { toIlikeFilterValue } = search();
    expect(toIlikeFilterValue("casa")).toBe('"%casa%"');
    expect(toIlikeFilterValue('casa "premium"')).toBe('"%casa \\"premium\\"%"');
    expect(toIlikeFilterValue("a\\b")).toBe('"%a\\\\b%"');
  });

  test("una coma o un parentesis no cortan la expresion or", () => {
    const { buildSearchOrFilter } = search();
    const filter = buildSearchOrFilter("casa, parana)");
    // el texto del operador queda entero dentro de las comillas del valor
    expect(filter).toContain('title.ilike."%casa, parana)%"');
    // y no aparece como un filtro suelto que PostgREST leeria aparte
    expect(filter).not.toContain("ilike.%casa");
  });

  test("cubre las cuatro columnas buscables", () => {
    const { buildSearchOrFilter, SEARCH_COLUMNS } = search();
    const filter = buildSearchOrFilter("casa");
    expect([...SEARCH_COLUMNS]).toEqual(["title", "slug", "city", "neighborhood"]);
    for (const column of SEARCH_COLUMNS) {
      expect(filter).toContain(`${column}.ilike.`);
    }
  });
});

/* ---------- estado efectivo ---------- */

test.describe("estado efectivo", () => {
  const { effectiveStatus } = require_("../src/lib/property-status.ts");

  test("status manda; si falta, se deriva de published", () => {
    expect(effectiveStatus({ status: "archived", published: true })).toBe("archived");
    expect(effectiveStatus({ published: true })).toBe("published");
    expect(effectiveStatus({ published: false })).toBe("draft");
    expect(effectiveStatus({})).toBe("draft");
  });
});

/* ---------- dónde ocurre el filtrado ---------- */

test.describe("filtrado server-side", () => {
  const page = () => codeOf(read("app/admin/properties/page.tsx"));
  const svc = () => codeOf(read("services/properties.ts"));

  test("la pagina valida el estado en vez de pasarlo crudo a la consulta", () => {
    const code = page();
    expect(code).toContain("isPropertyStatus(params.estado)");
    expect(code).toContain("normalizeSearchTerm(params.q)");
  });

  test("los filtros viajan al servicio, no se recorta la lista en el render", () => {
    const code = page();
    expect(code).toContain("const filters: PropertyFilters = { includeDraft: true, status, search }");
    expect(code).toContain("getAllProperties(filters)");
    expect(code).not.toContain("properties.filter(");
  });

  test("la consulta filtra por estado y busca en la base", () => {
    const code = svc();
    expect(code).toContain('query = query.eq("status", filters.status)');
    expect(code).toContain("query.or(buildSearchOrFilter(filters.search))");
  });

  test("el scope por agencia sigue aplicandose junto con los filtros nuevos", () => {
    const code = svc();
    const body = code.slice(
      code.indexOf("export async function getAllProperties"),
      code.indexOf("export async function getFeaturedProperties"),
    );
    expect(body).toContain('query.eq("agency_id", filters.agencyId)');
  });

  test("el fallback en memoria aplica los mismos filtros", () => {
    const code = svc();
    const memory = code.slice(
      code.indexOf("function applyFiltersMemory"),
      code.indexOf("/* ---------- API publica ---------- */"),
    );
    expect(memory).toContain("effectiveStatus(p) === filters.status");
    expect(memory).toContain("matchesSearch(p, term)");
  });

  test("cero resultados filtrados no se rellena con propiedades de muestra", () => {
    const code = svc();
    const empty = code.slice(code.indexOf("if (rows.length === 0)"));
    expect(empty.slice(0, 200)).toContain("if (hasNarrowingFilters(filters)) return []");
  });

  test("sin la migracion 0009 el estado se traduce al espejo published", () => {
    const code = svc();
    const legacy = code.slice(code.indexOf("if (isMissingColumn(error))"));
    expect(legacy).toContain('if (filters.status === "unpublished" || filters.status === "archived") return []');
    expect(legacy).toContain('if (filters.status === "published") legacy = legacy.eq("published", true)');
    expect(legacy).toContain('if (filters.status === "draft") legacy = legacy.eq("published", false)');
    expect(legacy).toContain("legacy.or(buildSearchOrFilter(filters.search))");
  });
});

/* ---------- la vista filtrada sobrevive a la navegación ---------- */

test.describe("filtros en la URL", () => {
  const filters = () => codeOf(read("app/admin/properties/PropertyListFilters.tsx"));

  test("el filtro se empuja a la URL, no queda en estado local", () => {
    const code = filters();
    expect(code).toContain("router.push");
    expect(code).toContain('params.set("estado"');
    expect(code).toContain('params.set("q"');
    // sin estado local: el server component es la única fuente de verdad
    expect(code).not.toContain("useState");
  });

  test("limpiar vuelve al listado sin query", () => {
    expect(filters()).toContain("router.push(BASE_PATH)");
  });

  test("las opciones de estado salen del ciclo de vida, no de una lista aparte", () => {
    const code = filters();
    expect(code).toContain("PROPERTY_STATUSES.map");
    expect(code).toContain("STATUS_LABEL[s]");
  });
});
