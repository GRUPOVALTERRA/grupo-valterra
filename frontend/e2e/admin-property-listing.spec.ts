import { test, expect } from "@playwright/test";
import Module from "node:module";

/**
 * Sprint 15-B — qué muestra el listado administrativo.
 *
 * Estas pruebas ejecutan el servicio real contra un cliente Supabase falso que
 * registra la consulta y la aplica sobre un juego de filas fijo. No es análisis
 * estático: si el filtro de estado deja de armarse bien, la propiedad archivada
 * de prueba vuelve a aparecer y la prueba falla.
 *
 * Sin navegador, sin red, sin Supabase.
 */

const require_ = Module.createRequire(__filename);
const supabase = require_("../src/lib/supabase.ts");
const service = require_("../src/services/properties.ts");
const filter = require_("../src/lib/admin-property-filter.ts");

const { parseAdminStatusFilter, statusesForFilter } = filter;

/* ---------- filas de prueba ---------- */

type Row = Record<string, unknown>;

function row(slug: string, status: string, extra: Row = {}): Row {
  return {
    id: `id-${slug}`,
    slug,
    title: slug.replace(/-/g, " "),
    description: null,
    price: 100000,
    currency: "USD",
    per_month: false,
    operation_type: "venta",
    property_type: "casa",
    city: "Parana",
    neighborhood: null,
    province: "Entre Rios",
    country: "Argentina",
    address: null,
    lat: null,
    lng: null,
    bedrooms: null,
    bathrooms: null,
    parking: null,
    covered_area_m2: null,
    total_area_m2: null,
    badges: null,
    cover_image: null,
    gallery: null,
    agent_name: null,
    agent_phone: null,
    agency_id: "agency-1",
    // `published` es el espejo de `status` (trigger de la migración 0009)
    published: status === "published",
    status,
    published_at: null,
    archived_at: null,
    featured: false,
    featured_order: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...extra,
  };
}

/** Una de cada estado, más la archivada que no debe aparecer sola. */
const ROWS: Row[] = [
  row("casa-borrador", "draft"),
  row("casa-publicada", "published"),
  row("casa-despublicada", "unpublished"),
  row("casa-archivada-de-prueba", "archived"),
];

/* ---------- cliente Supabase falso ---------- */

/** `col.ilike."%term%"` → pares columna/término. */
function parseOrExpression(expr: string): { column: string; term: string }[] {
  const out: { column: string; term: string }[] = [];
  const re = /(\w+)\.ilike\."%(.*?)%"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    out.push({ column: m[1], term: m[2].replace(/\\(.)/g, "$1").toLowerCase() });
  }
  return out;
}

const contains = (value: unknown, term: string) =>
  String(value ?? "").toLowerCase().includes(term);

function fakeSupabase(rows: Row[]) {
  const predicates: ((r: Row) => boolean)[] = [];
  const seen: { method: string; args: unknown[] }[] = [];
  const note = (method: string, ...args: unknown[]) => seen.push({ method, args });

  const builder: Record<string, unknown> = {
    select: (...a: unknown[]) => (note("select", ...a), builder),
    order: (...a: unknown[]) => (note("order", ...a), builder),
    limit: (...a: unknown[]) => (note("limit", ...a), builder),
    eq: (col: string, val: unknown) => {
      note("eq", col, val);
      predicates.push((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      note("in", col, vals);
      predicates.push((r) => vals.includes(r[col]));
      return builder;
    },
    ilike: (col: string, pattern: string) => {
      note("ilike", col, pattern);
      const term = pattern.replace(/%/g, "").toLowerCase();
      predicates.push((r) => contains(r[col], term));
      return builder;
    },
    or: (expr: string) => {
      note("or", expr);
      const parts = parseOrExpression(expr);
      predicates.push((r) => parts.some((p) => contains(r[p.column], p.term)));
      return builder;
    },
    // Si el listado intentara escribir, quedaría registrado acá.
    update: (...a: unknown[]) => (note("update", ...a), builder),
    insert: (...a: unknown[]) => (note("insert", ...a), builder),
    delete: (...a: unknown[]) => (note("delete", ...a), builder),
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows.filter((r) => predicates.every((p) => p(r))), error: null }),
  };

  return { client: { from: (t: string) => (note("from", t), builder) }, seen };
}

const originalConfigured = supabase.isSupabaseConfigured;
const originalAdmin = supabase.getSupabaseAdmin;

function withRows(rows: Row[]) {
  const fake = fakeSupabase(rows);
  supabase.isSupabaseConfigured = () => true;
  supabase.getSupabaseAdmin = () => fake.client;
  return fake;
}

test.afterEach(() => {
  supabase.isSupabaseConfigured = originalConfigured;
  supabase.getSupabaseAdmin = originalAdmin;
});

/** Lo que pide la página del panel para un `?estado=` dado. */
function adminQuery(rawEstado?: unknown, search?: string) {
  const selected = parseAdminStatusFilter(rawEstado);
  return {
    includeDraft: true,
    statuses: statusesForFilter(selected),
    search,
    allowSampleFallback: false,
    agencyId: "agency-1",
  };
}

const slugs = (items: { slug: string }[]) => items.map((p) => p.slug);

/* ---------- qué se ve al entrar ---------- */

test.describe("listado por defecto", () => {
  test("sin ?estado= la archivada de prueba queda fuera", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery(undefined));
    expect(slugs(found)).toEqual([
      "casa-borrador",
      "casa-publicada",
      "casa-despublicada",
    ]);
    expect(slugs(found)).not.toContain("casa-archivada-de-prueba");
  });

  test("borradores, publicadas y despublicadas si aparecen por defecto", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery());
    expect(found.map((p: { status: string }) => p.status).sort()).toEqual([
      "draft",
      "published",
      "unpublished",
    ]);
  });

  test("el scope por agencia se sigue aplicando junto al filtro de estado", async () => {
    const fake = withRows([...ROWS, row("casa-de-otra-agencia", "published", { agency_id: "agency-2" })]);
    const found = await service.getAllProperties(adminQuery());
    expect(slugs(found)).not.toContain("casa-de-otra-agencia");
    expect(fake.seen).toContainEqual({ method: "eq", args: ["agency_id", "agency-1"] });
  });
});

/* ---------- pedir archivadas explícitamente ---------- */

test.describe("archivadas a pedido", () => {
  test("estado=archived devuelve solamente las archivadas", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery("archived"));
    expect(slugs(found)).toEqual(["casa-archivada-de-prueba"]);
  });

  test("estado=all incluye la archivada junto al resto", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery("all"));
    expect(slugs(found)).toHaveLength(4);
    expect(slugs(found)).toContain("casa-archivada-de-prueba");
  });

  test("estado=all no restringe por status en la consulta", async () => {
    const fake = withRows(ROWS);
    await service.getAllProperties(adminQuery("all"));
    expect(fake.seen.filter((c) => c.method === "in")).toEqual([]);
    expect(fake.seen.filter((c) => c.method === "eq" && c.args[0] === "status")).toEqual([]);
  });

  test("cada estado puntual devuelve sólo el suyo", async () => {
    for (const [estado, slug] of [
      ["draft", "casa-borrador"],
      ["published", "casa-publicada"],
      ["unpublished", "casa-despublicada"],
    ] as const) {
      withRows(ROWS);
      const found = await service.getAllProperties(adminQuery(estado));
      expect(slugs(found)).toEqual([slug]);
    }
  });
});

/* ---------- valores manipulados ---------- */

test.describe("estado invalido", () => {
  test("un valor desconocido cae en el default seguro, no en 'todas'", async () => {
    for (const raw of ["zombie", "ARCHIVED", "", "  ", "all;--", ["archived"], 7, null]) {
      withRows(ROWS);
      const found = await service.getAllProperties(adminQuery(raw));
      expect(slugs(found), `estado=${JSON.stringify(raw)}`).not.toContain(
        "casa-archivada-de-prueba",
      );
      expect(slugs(found), `estado=${JSON.stringify(raw)}`).toHaveLength(3);
    }
  });

  test("la consulta pide los tres estados activos, nunca archived", async () => {
    const fake = withRows(ROWS);
    await service.getAllProperties(adminQuery("zombie"));
    const statusFilter = fake.seen.find((c) => c.method === "in" && c.args[0] === "status");
    expect(statusFilter?.args[1]).toEqual(["draft", "published", "unpublished"]);
  });
});

/* ---------- búsqueda combinada ---------- */

test.describe("busqueda junto al estado", () => {
  test("la busqueda se combina con el filtro y no destapa archivadas", async () => {
    withRows(ROWS);
    // el término matchea la archivada, pero el filtro por defecto la excluye
    const found = await service.getAllProperties(adminQuery(undefined, "archivada"));
    expect(slugs(found)).toEqual([]);
  });

  test("la misma busqueda con estado=archived si la encuentra", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery("archived", "archivada"));
    expect(slugs(found)).toEqual(["casa-archivada-de-prueba"]);
  });

  test("una busqueda sin coincidencias devuelve vacio real, sin propiedades de muestra", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery(undefined, "no-existe-esta-propiedad"));
    expect(found).toEqual([]);
  });
});

/* ---------- nunca datos de muestra en el panel ---------- */

test.describe("sin snapshot en el panel", () => {
  test("tabla vacia no se rellena con el snapshot", async () => {
    withRows([]);
    const found = await service.getAllProperties(adminQuery());
    expect(found).toEqual([]);
  });

  test("un error de consulta tampoco trae propiedades de muestra", async () => {
    supabase.isSupabaseConfigured = () => true;
    supabase.getSupabaseAdmin = () => ({
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "order", "eq", "in", "or", "ilike", "limit"]) {
          b[m] = () => b;
        }
        b.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: { message: "boom", code: "XXX" } });
        return b;
      },
    });
    const found = await service.getAllProperties(adminQuery());
    expect(found).toEqual([]);
  });

  test("sin Supabase configurado el panel no inventa filas", async () => {
    supabase.isSupabaseConfigured = () => false;
    const found = await service.getAllProperties(adminQuery());
    expect(found).toEqual([]);
  });

  test("el sitio publico conserva el snapshot de respaldo", async () => {
    supabase.isSupabaseConfigured = () => false;
    // sin filtros del panel y sin prohibirlo: el listado publico no queda en blanco
    const found = await service.getAllProperties({ limit: 3 });
    expect(found.length).toBeGreaterThan(0);
  });
});

/* ---------- el filtro no escribe ---------- */

test.describe("el listado no altera datos", () => {
  test("filtrar y buscar no dispara ninguna escritura", async () => {
    const fake = withRows(ROWS);
    await service.getAllProperties(adminQuery("all", "casa"));
    const writes = fake.seen.filter((c) => ["update", "insert", "delete"].includes(c.method));
    expect(writes).toEqual([]);
  });

  test("los estados de las filas devueltas son los de la base", async () => {
    withRows(ROWS);
    const found = await service.getAllProperties(adminQuery("all"));
    const byslug = Object.fromEntries(
      found.map((p: { slug: string; status: string }) => [p.slug, p.status]),
    );
    expect(byslug).toEqual({
      "casa-borrador": "draft",
      "casa-publicada": "published",
      "casa-despublicada": "unpublished",
      "casa-archivada-de-prueba": "archived",
    });
  });
});

/* ---------- despliegue anterior a la migración 0009 ---------- */

test.describe("sin la migracion 0009", () => {
  /** Cliente que falla el SELECT extendido y responde el legacy. */
  function fakeLegacy(rows: Row[]) {
    const seen: { method: string; args: unknown[] }[] = [];
    let attempt = 0;
    const make = () => {
      const predicates: ((r: Row) => boolean)[] = [];
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (col: string, val: unknown) => {
          seen.push({ method: "eq", args: [col, val] });
          predicates.push((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => {
          seen.push({ method: "in", args: [col, vals] });
          predicates.push((r) => vals.includes(r[col]));
          return b;
        },
        ilike: () => b,
        or: () => b,
        then: (resolve: (v: unknown) => unknown) => {
          attempt += 1;
          if (attempt === 1) {
            return resolve({
              data: null,
              error: { code: "42703", message: 'column properties.status does not exist' },
            });
          }
          return resolve({ data: rows.filter((r) => predicates.every((p) => p(r))), error: null });
        },
      };
      return b;
    };
    return { client: { from: () => make() }, seen };
  }

  const LEGACY_ROWS: Row[] = [
    row("casa-borrador", "draft"),
    row("casa-publicada", "published"),
  ].map(({ status, published_at, archived_at, ...rest }) => ({ ...rest }));

  test("el default no falla ni vacia el listado", async () => {
    const fake = fakeLegacy(LEGACY_ROWS);
    supabase.isSupabaseConfigured = () => true;
    supabase.getSupabaseAdmin = () => fake.client;
    const found = await service.getAllProperties(adminQuery());
    // sin columna status, borrador y publicada son todo lo que puede existir
    expect(slugs(found).sort()).toEqual(["casa-borrador", "casa-publicada"]);
  });

  test("pedir archivadas devuelve vacio, no el listado entero", async () => {
    const fake = fakeLegacy(LEGACY_ROWS);
    supabase.isSupabaseConfigured = () => true;
    supabase.getSupabaseAdmin = () => fake.client;
    const found = await service.getAllProperties(adminQuery("archived"));
    expect(found).toEqual([]);
  });

  test("pedir publicadas se traduce al espejo published", async () => {
    const fake = fakeLegacy(LEGACY_ROWS);
    supabase.isSupabaseConfigured = () => true;
    supabase.getSupabaseAdmin = () => fake.client;
    const found = await service.getAllProperties(adminQuery("published"));
    expect(slugs(found)).toEqual(["casa-publicada"]);
    expect(fake.seen).toContainEqual({ method: "eq", args: ["published", true] });
  });
});
