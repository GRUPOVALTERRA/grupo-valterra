import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateEvent,
  normalizePath,
  isAdminPath,
  referrerHost,
  cleanPropertySlug,
  visitHash,
  EVENT_TYPES,
  WA_SOURCES,
} from "../src/lib/events";

/**
 * Analitica F2 (S20-PR1) — guardas del log propio de eventos.
 *
 * Dos capas:
 *   1. Comportamiento de lib/events.ts (modulo puro, se importa directo).
 *   2. Guardas estaticas sobre la migracion 0014 y el endpoint: que las
 *      invariantes de privacidad y de RLS no se puedan borrar sin que
 *      falle un test.
 */

const ROOT = join(__dirname, "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/0014_site_events.sql"), "utf8");
const ROUTE = readFileSync(join(ROOT, "src/app/api/events/route.ts"), "utf8");
const EVENTS_LIB = readFileSync(join(ROOT, "src/lib/events.ts"), "utf8");
const WALINK = readFileSync(join(ROOT, "src/components/public/WaLink.tsx"), "utf8");

const pageview = (path: string) => ({ type: "pageview", path });

/** SQL sin lineas de comentario: lo que Postgres realmente ejecuta. */
const sqlEjecutable = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

// ============================================================
// 1. normalizePath
// ============================================================
test.describe("normalizePath", () => {
  test("acepta rutas publicas y les saca la barra final", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/propiedades")).toBe("/propiedades");
    expect(normalizePath("/propiedades/")).toBe("/propiedades");
  });

  test("descarta la query string entera (puede traer PII de terceros)", () => {
    expect(normalizePath("/propiedades?email=alguien@ejemplo.com")).toBe("/propiedades");
    expect(normalizePath("/ficha#seccion")).toBe("/ficha");
  });

  test("de una URL absoluta se queda solo con el pathname", () => {
    expect(normalizePath("https://www.grupovalterra.com.ar/propiedades/casa-1")).toBe(
      "/propiedades/casa-1",
    );
  });

  test("rechaza rutas hostiles o malformadas", () => {
    expect(normalizePath("//evil.com")).toBeNull(); // protocol-relative disfrazada
    expect(normalizePath("propiedades")).toBeNull(); // sin barra inicial
    expect(normalizePath("/a/../../etc")).toBeNull(); // traversal
    expect(normalizePath("/a\\b")).toBeNull();
    expect(normalizePath("/a\nb")).toBeNull(); // log injection
    expect(normalizePath("/" + "x".repeat(400))).toBeNull();
    expect(normalizePath(123)).toBeNull();
    expect(normalizePath("")).toBeNull();
  });
});

// ============================================================
// 2. El admin nunca se instrumenta
// ============================================================
test.describe("el admin queda fuera del log", () => {
  test("isAdminPath reconoce el panel sin falsos positivos", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/leads")).toBe(true);
    expect(isAdminPath("/administracion")).toBe(false); // no es el panel
    expect(isAdminPath("/propiedades")).toBe(false);
  });

  test("validateEvent rechaza cualquier ruta de admin", () => {
    for (const p of ["/admin", "/admin/leads", "/admin/properties/x/edit"]) {
      const r = validateEvent({ body: pageview(p) });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.reason).toBe("path-admin");
    }
  });

  /**
   * FIX 1 (S20-PR1) — aplicacion y base deben decir EXACTAMENTE lo mismo.
   *
   * El check original era `path not like '/admin%'`, mas amplio que
   * isAdminPath(): habria rechazado /administracion, una ruta publica
   * legitima. Cuando app y base discrepan, se pierden eventos en silencio.
   */
  test("FIX 1: el check de la base es equivalente a isAdminPath, no mas amplio", () => {
    expect(MIGRATION).toContain("path <> '/admin' and path not like '/admin/%'");
    // El prefijo demasiado amplio no debe volver al SQL EJECUTABLE. En los
    // comentarios si aparece: ahi se explica por que se descarto.
    expect(sqlEjecutable(MIGRATION)).not.toContain("path not like '/admin%'");
  });

  test("FIX 1: rutas publicas con prefijo 'admin' se ACEPTAN en ambas capas", () => {
    const publicas = ["/administracion", "/admins", "/administrar-consorcios", "/adminis"];

    for (const p of publicas) {
      // Capa de aplicacion.
      expect(isAdminPath(p)).toBe(false);
      const r = validateEvent({ body: pageview(p) });
      expect(r.valid).toBe(true);

      // Capa de base: simulacion del check SQL tal como quedo escrito.
      const pasaElCheck = p !== "/admin" && !p.startsWith("/admin/");
      expect(pasaElCheck).toBe(true);
    }
  });

  test("FIX 1: app y base coinciden sobre el mismo set de rutas", () => {
    const casos: Array<[string, boolean]> = [
      ["/admin", true],
      ["/admin/", true],
      ["/admin/leads", true],
      ["/admin/properties/casa-1/edit", true],
      ["/administracion", false],
      ["/admins", false],
      ["/propiedades", false],
      ["/", false],
    ];

    for (const [path, esAdmin] of casos) {
      // normalizePath colapsa "/admin/" -> "/admin" antes de evaluar.
      const normalizado = normalizePath(path)!;
      const app = isAdminPath(normalizado);
      const db = normalizado === "/admin" || normalizado.startsWith("/admin/");
      expect(app).toBe(esAdmin);
      expect(db).toBe(esAdmin); // misma respuesta en las dos capas
    }
  });
});

// ============================================================
// 3. Allowlists
// ============================================================
test.describe("allowlists de tipo y superficie", () => {
  test("solo pageview y wa_click", () => {
    expect(EVENT_TYPES).toEqual(["pageview", "wa_click"]);
    const r = validateEvent({ body: { type: "compra", path: "/" } });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("tipo-desconocido");
  });

  test("las 6 superficies son exactamente las de WaSource en WaLink", () => {
    for (const s of WA_SOURCES) expect(WALINK).toContain(`"${s}"`);
    expect(WA_SOURCES.length).toBe(6);
  });

  test("cada superficie valida se acepta en un wa_click", () => {
    for (const source of WA_SOURCES) {
      const r = validateEvent({ body: { type: "wa_click", path: "/", source } });
      expect(r.valid).toBe(true);
      if (r.valid) expect(r.event.source).toBe(source);
    }
  });

  test("una superficie inventada se rechaza", () => {
    const r = validateEvent({ body: { type: "wa_click", path: "/", source: "popup-fantasma" } });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("source-invalida");
  });

  test("wa_click sin superficie se rechaza; pageview con superficie tambien", () => {
    const sinSource = validateEvent({ body: { type: "wa_click", path: "/" } });
    expect(sinSource.valid).toBe(false);
    if (!sinSource.valid) expect(sinSource.reason).toBe("source-faltante");

    const conSource = validateEvent({ body: { type: "pageview", path: "/", source: "ficha" } });
    expect(conSource.valid).toBe(false);
    if (!conSource.valid) expect(conSource.reason).toBe("source-en-pageview");
  });

  test("la base repite la allowlist de superficies (defensa en profundidad)", () => {
    for (const s of WA_SOURCES) expect(MIGRATION).toContain(`'${s}'`);
    expect(MIGRATION).toContain("site_events_source_coherente");
  });
});

// ============================================================
// 4. Privacidad — la invariante central del sprint
// ============================================================
test.describe("privacidad: nada de PII llega a la tabla", () => {
  test("la fila validada solo tiene los campos permitidos", () => {
    const r = validateEvent({ body: pageview("/propiedades") });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(Object.keys(r.event).sort()).toEqual(
      [
        "event_type",
        "path",
        "property_slug",
        "referrer_host",
        "source",
        "utm_campaign",
        "utm_medium",
        "utm_source",
      ].sort(),
    );
  });

  test("campos extra del body se descartan por completo", () => {
    const r = validateEvent({
      body: {
        ...pageview("/"),
        ip: "190.1.2.3",
        email: "alguien@ejemplo.com",
        userAgent: "Mozilla/5.0",
        agency_id: "00000000-0000-0000-0000-000000000000",
        visit_hash: "deadbeefdeadbeef",
      },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    const serialized = JSON.stringify(r.event);
    expect(serialized).not.toContain("190.1.2.3");
    expect(serialized).not.toContain("alguien@ejemplo.com");
    expect(serialized).not.toContain("Mozilla");
    expect(serialized).not.toContain("deadbeef");
    expect(r.event).not.toHaveProperty("agency_id");
  });

  test("del referer se guarda el host, jamas la URL completa", () => {
    expect(referrerHost("https://www.instagram.com/p/abc123?igsh=TOKEN")).toBe("instagram.com");
    expect(referrerHost("https://l.facebook.com/l.php?u=https%3A%2F%2Fx")).toBe("l.facebook.com");
    expect(referrerHost("no-es-una-url")).toBeNull();
    expect(referrerHost(null)).toBeNull();
  });

  test("el referrer_host sale del header, no del body", () => {
    const r = validateEvent({
      body: { ...pageview("/"), referrer_host: "mentira.com", referrerHost: "mentira.com" },
      referer: "https://www.instagram.com/grupovalterraar",
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.event.referrer_host).toBe("instagram.com");
  });

  test("visit_hash: pseudonimo diario, estable dentro del dia y NO cross-day", () => {
    const ip = "190.1.2.3";
    const ua = "Mozilla/5.0";
    const hoy = visitHash(ip, ua, "sal-secreta", new Date("2026-08-10T12:00:00Z"));
    const masTarde = visitHash(ip, ua, "sal-secreta", new Date("2026-08-10T23:59:00Z"));
    const manana = visitHash(ip, ua, "sal-secreta", new Date("2026-08-11T00:01:00Z"));

    expect(hoy).toHaveLength(16);
    // Mismo visitante, mismo dia -> mismo valor (permite deduplicar).
    expect(masTarde).toBe(hoy);
    // Mismo visitante, dia siguiente -> valor distinto. Esta es la garantia
    // central: no se puede construir un identificador cross-day.
    expect(manana).not.toBe(hoy);
    expect(hoy).not.toContain(ip);
    expect(/^[0-9a-f]{16}$/.test(hoy!)).toBe(true);
  });

  test("la sal cambia el resultado (no es un hash publico de IP+UA)", () => {
    const dia = new Date("2026-08-10T12:00:00Z");
    const a = visitHash("190.1.2.3", "UA", "sal-a", dia);
    const b = visitHash("190.1.2.3", "UA", "sal-b", dia);
    expect(a).not.toBe(b);
  });

  test("sin sal configurada no se emite pseudonimo (queda null)", () => {
    expect(visitHash("190.1.2.3", "UA", undefined)).toBeNull();
    expect(visitHash("190.1.2.3", "UA", "")).toBeNull();
  });

  /**
   * FIX 3 (S20-PR1) — terminologia de privacidad honesta.
   *
   * visit_hash es un pseudonimo, NO anonimizacion: derivado de IP+UA sigue
   * siendo dato personal, y con la sal en mano se puede confirmar por
   * fuerza bruta. Describirlo como "sin PII" o "irreversible" seria falso y
   * llevaria a tratar la tabla con menos cuidado del que merece.
   */
  test("FIX 3: la doc describe el hash como pseudonimo, no como anonimo", () => {
    for (const [nombre, texto] of [
      ["lib/events.ts", EVENTS_LIB],
      ["migracion 0014", MIGRATION],
    ] as const) {
      expect(texto, `${nombre}: debe usar el termino pseudonimo`).toMatch(/pseudonim/i);
      // No debe afirmar anonimato ni irreversibilidad absoluta.
      expect(texto, `${nombre}: no debe afirmar "sin PII"`).not.toMatch(/sin\s+pii/i);
      expect(texto, `${nombre}: no debe afirmar irreversibilidad`).not.toMatch(
        /irreversible(?!\s+en\s+sentido\s+absoluto)/i,
      );
    }
  });

  test("FIX 3: se documenta que visit_hash puede ser null y el tablero lo tolera", () => {
    expect(MIGRATION).toMatch(/visitantes unicos/i);
    expect(EVENTS_LIB).toMatch(/NULL/);
  });

  test("FIX 3: site_events se describe como telemetria observada, no contabilidad", () => {
    expect(MIGRATION).toMatch(/telemetria observada/i);
    expect(ROUTE).toMatch(/telemetria observada/i);
  });

  test("el endpoint no persiste ip ni user-agent", () => {
    // Solo la huella va al log; la IP cruda nunca se inserta.
    expect(ROUTE).toContain("ipFingerprint");
    expect(ROUTE).not.toMatch(/insert\([\s\S]*\bip\b\s*:/);
    expect(ROUTE).not.toMatch(/insert\([\s\S]*user_agent/);
    // La migracion no tiene columnas para eso.
    expect(MIGRATION).not.toMatch(/^\s*ip_address\s/m);
    expect(MIGRATION).not.toMatch(/^\s*user_agent\s/m);
  });
});

// ============================================================
// 5. Slug y UTMs saneados
// ============================================================
test.describe("saneo de slug y UTM", () => {
  test("el slug solo admite alfanumerico, guion y guion bajo", () => {
    expect(cleanPropertySlug("casa-en-corrientes-1")).toBe("casa-en-corrientes-1");
    expect(cleanPropertySlug("casa'; drop table--")).toBeNull();
    expect(cleanPropertySlug("../../etc/passwd")).toBeNull();
    expect(cleanPropertySlug("")).toBeNull();
    expect(cleanPropertySlug(42)).toBeNull();
  });

  test("las UTM se recortan a la cota de la base", () => {
    const r = validateEvent({
      body: { ...pageview("/"), utmSource: "x".repeat(200), utmMedium: "  bio  " },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.event.utm_source!.length).toBe(80);
    expect(r.event.utm_medium).toBe("bio");
  });
});

// ============================================================
// 6. Endpoint y migracion — guardas estructurales
// ============================================================
test.describe("endpoint POST /api/events", () => {
  test("responde 204 siempre y nunca filtra el motivo al cliente", () => {
    expect(ROUTE).toContain("status: 204");
    // Ningun otro codigo de estado: un 400/429 seria un oraculo.
    const estados = [...ROUTE.matchAll(/status:\s*(\d{3})/g)].map((m) => m[1]);
    expect([...new Set(estados)]).toEqual(["204"]);
  });

  test("usa rate limiting y runtime nodejs", () => {
    expect(ROUTE).toContain("rateLimit");
    expect(ROUTE).toContain('runtime = "nodejs"');
    expect(ROUTE).toContain('dynamic = "force-dynamic"');
  });

  test("agency_id se resuelve server-side desde el slug", () => {
    expect(ROUTE).toContain('.from("properties")');
    expect(ROUTE).toContain('.select("agency_id")');
    // Nunca se toma del body.
    expect(ROUTE).not.toMatch(/agency_id:\s*(body|raw|data)\./);
  });

  test("escribe con service_role, no con el cliente del usuario", () => {
    expect(ROUTE).toContain("getSupabaseAdmin");
    expect(ROUTE).not.toContain("getSupabaseServer");
  });

  /**
   * FIX 2 (S20-PR1) — logs saneados.
   *
   * Los mensajes de error de un driver de base arrastran fragmentos de
   * query, nombres de columnas y valores de la fila. A los logs va la
   * operacion y un codigo; nada mas.
   */
  test("FIX 2: nunca se loguea el mensaje crudo del error de base", () => {
    expect(ROUTE).not.toMatch(/error\.message/);
    expect(ROUTE).not.toMatch(/error\.details/);
    expect(ROUTE).not.toMatch(/error\.hint/);
    // Tampoco el objeto error entero, que los arrastraria igual.
    expect(ROUTE).not.toMatch(/log\.(error|warn)\([^)]*,\s*error\s*\)/);
  });

  test("FIX 2: nunca se loguea el stack ni el error completo de una excepcion", () => {
    expect(ROUTE).not.toMatch(/\.stack/);
    expect(ROUTE).not.toMatch(/err as Error\)/);
    // Del catch sale solo el NOMBRE de la excepcion.
    expect(ROUTE).toContain("err instanceof Error ? err.name");
  });

  test("FIX 2: nunca se loguea el payload recibido", () => {
    // Se inspeccionan los argumentos de cada log.* : ninguna de las
    // variables que contienen lo enviado por el cliente puede aparecer como
    // valor. (Que la palabra "body" salga en un mensaje literal esta bien;
    // lo que no puede pasar es que se pase la variable.)
    const llamadas = [...ROUTE.matchAll(/log\.\w+\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(llamadas.length).toBeGreaterThan(0);

    for (const args of llamadas) {
      // Fuera de los strings literales no debe nombrarse el payload.
      const sinLiterales = args.replace(/"[^"]*"/g, '""');
      for (const variable of ["text", "raw", "event.path"]) {
        expect(sinLiterales, `log con \`${variable}\`: ${args}`).not.toMatch(
          new RegExp(`(^|[^.\\w])${variable.replace(".", "\\.")}\\b`),
        );
      }
    }
  });

  test("FIX 2: los logs de base llevan operation y code acotado", () => {
    expect(ROUTE).toContain('operation: "insert"');
    expect(ROUTE).toContain('operation: "lookup-agency"');
    expect(ROUTE).toContain("errorCode(error)");
    // El codigo se valida contra un patron: no se confia en su forma.
    expect(ROUTE).toMatch(/\/\^\[A-Za-z0-9_\]\{1,20\}\$\//);
  });

  /**
   * FIX 4 (S20-PR1) — cota de body REAL, no un precheck de header.
   *
   * Content-Length es opcional (falta en Transfer-Encoding: chunked) y lo
   * controla el cliente. Como unica defensa seria decorativo.
   */
  test("FIX 4: la cota se aplica leyendo el stream, no confiando en Content-Length", () => {
    expect(ROUTE).toContain("readBoundedText");
    expect(ROUTE).toContain("getReader()");
    expect(ROUTE).toContain("reader.cancel()");
    expect(ROUTE).toContain("total > maxBytes");
    // El header ya no se usa como control de tamano.
    expect(ROUTE).not.toContain('headers.get("content-length")');
  });

  test("FIX 4: se documenta por que el header no alcanza", () => {
    expect(ROUTE).toMatch(/chunked/i);
    // Y no queda la afirmacion original de "cota dura" sobre el header.
    expect(ROUTE).not.toMatch(/cota dura del body/i);
  });

  test("FIX 4: el body se decodifica en modo estricto", () => {
    expect(ROUTE).toContain("fatal: true");
  });
});

test.describe("migracion 0014", () => {
  test("es aditiva e idempotente", () => {
    expect(MIGRATION).toContain("create table if not exists public.site_events");
    // Ningun DROP ni ALTER destructivo EJECUTABLE. El unico `drop table` del
    // archivo vive comentado, dentro de las instrucciones de rollback.
    const ejecutable = MIGRATION.split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(ejecutable).not.toMatch(/\bdrop\b/i);
    expect(ejecutable).not.toMatch(/^\s*alter table public\.(properties|agencies|leads)/im);
  });

  test("RLS default-deny sin ninguna politica", () => {
    expect(MIGRATION).toContain("alter table public.site_events enable row level security");
    expect(MIGRATION).toContain("force  row level security");
    // Ni una sola policy: service_role es el unico camino.
    expect(MIGRATION).not.toMatch(/create policy/i);
  });

  test("tiene los indices que el tablero necesita", () => {
    for (const idx of [
      "site_events_type_time_idx",
      "site_events_slug_time_idx",
      "site_events_agency_time_idx",
      "site_events_source_time_idx",
    ]) {
      expect(MIGRATION).toContain(idx);
    }
  });

  test("documenta el gate de Production y el rollback", () => {
    expect(MIGRATION).toMatch(/GATE/);
    expect(MIGRATION).toMatch(/Rollback/i);
  });
});

test("lib/events.ts es puro: sin Supabase ni Next", () => {
  expect(EVENTS_LIB).not.toContain("@supabase");
  expect(EVENTS_LIB).not.toContain("next/");
});
