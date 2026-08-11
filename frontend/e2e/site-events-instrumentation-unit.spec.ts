import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  externalReferrerHost,
  parseUtms,
  hasUtm,
  resolveAttribution,
  sanitizeAttribution,
  ATTRIBUTION_FIELDS,
  ATTRIBUTION_KEY,
  type Attribution,
} from "../src/lib/attribution";
import { validateEvent, cleanReferrerHost, WA_SOURCES } from "../src/lib/events";
import { shouldTrackPageview } from "../src/components/analytics/PageviewTracker";

/**
 * VALTERRA DATA & ANALYTICS — S20-PR2 · instrumentación web.
 *
 * Guardas A..Q del gate: production isolation, pageview, atribución,
 * sessionStorage y dual-emit de WaLink.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const ROUTE = read("src/app/api/events/route.ts");
const HELPER = read("src/components/analytics/trackSiteEvent.ts");
const TRACKER = read("src/components/analytics/PageviewTracker.tsx");
const WALINK = read("src/components/public/WaLink.tsx");
const LAYOUT = read("src/app/layout.tsx");
const ATTR = read("src/lib/attribution.ts");

const SITE = "www.grupovalterra.com.ar";

/**
 * Código ejecutable: sin comentarios de bloque ni de línea.
 *
 * Necesario porque estos archivos DOCUMENTAN en prosa lo que no hacen
 * ("nunca localStorage", "sin visit_hash"). Buscar esas palabras en el
 * texto crudo daría falsos positivos sobre los propios comentarios que
 * explican la regla.
 */
const codigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

const HELPER_CODE = codigo(HELPER);
const ATTR_CODE = codigo(ATTR);

// ============================================================
// A · Production guard (ya validado en PR2 pre-gate; se re-afirma acá)
// ============================================================
test.describe("A · production guard incluido en este PR", () => {
  test("el guard sigue presente y es lo primero del handler", () => {
    const handler = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    const guard = handler.indexOf("isIngestionEnabled(process.env.VERCEL_ENV)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(handler.indexOf("await readBoundedText(request"));
    expect(guard).toBeLessThan(handler.indexOf("rateLimit(`events:"));
    expect(guard).toBeLessThan(handler.indexOf("getSupabaseAdmin"));
  });
});

// ============================================================
// B/C/D/E · Pageview
// ============================================================
test.describe("pageview propio", () => {
  test("B · la primera ruta se registra", () => {
    expect(shouldTrackPageview(null, "/")).toBe(true);
    expect(shouldTrackPageview(null, "/propiedades")).toBe(true);
  });

  test("C · una navegación del App Router genera un pageview nuevo", () => {
    expect(shouldTrackPageview("/", "/propiedades")).toBe(true);
    expect(shouldTrackPageview("/propiedades", "/propiedades/casa-1")).toBe(true);
  });

  test("D · el admin genera CERO eventos", () => {
    for (const p of ["/admin", "/admin/leads", "/admin/properties/x/edit"]) {
      expect(shouldTrackPageview(null, p)).toBe(false);
      expect(shouldTrackPageview("/", p)).toBe(false);
    }
    // Y no confunde rutas públicas con prefijo parecido.
    expect(shouldTrackPageview(null, "/administracion")).toBe(true);
  });

  test("E · misma ruta dos veces = un solo evento (re-render / StrictMode)", () => {
    expect(shouldTrackPageview("/propiedades", "/propiedades")).toBe(false);
    expect(shouldTrackPageview("/", "/")).toBe(false);
  });

  test("E · el tracker marca la ruta ANTES de emitir", () => {
    const efecto = TRACKER.slice(TRACKER.indexOf("useEffect"));
    expect(efecto.indexOf("lastTrackedPath = pathname")).toBeLessThan(
      efecto.indexOf("trackSiteEvent("),
    );
  });

  test("el tracker está montado en el layout y Vercel Analytics sigue ahí", () => {
    expect(LAYOUT).toContain("<PageviewTracker />");
    expect(LAYOUT).toContain("<Analytics />");
    expect(LAYOUT).toContain('from "@vercel/analytics/next"');
  });
});

// ============================================================
// F/G · Path y UTM
// ============================================================
test.describe("path y UTM", () => {
  test("F · el path se envía sin query string", () => {
    // El helper toma location.pathname, que por definición no trae query.
    expect(HELPER).toContain("window.location.pathname");
    expect(HELPER).not.toContain("location.href");
    expect(HELPER).not.toMatch(/path:\s*[^,\n]*search/);
  });

  test("G · las UTM viajan en campos separados, no en el path", () => {
    for (const campo of ["utmSource", "utmMedium", "utmCampaign"]) {
      expect(HELPER).toContain(`${campo}:`);
    }
    const utms = parseUtms("?utm_source=instagram&utm_medium=social&utm_campaign=lote_202608");
    expect(utms).toEqual({
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "lote_202608",
    });
  });

  test("G · utm_term y utm_content se ignoran (no están en el modelo)", () => {
    const utms = parseUtms("?utm_source=x&utm_term=SECRETO&utm_content=OTRO");
    expect(JSON.stringify(utms)).not.toContain("SECRETO");
    expect(JSON.stringify(utms)).not.toContain("OTRO");
  });

  test("G · las UTM se recortan a la cota de la base", () => {
    const utms = parseUtms(`?utm_source=${"x".repeat(200)}`);
    expect(utms.utm_source!.length).toBe(80);
  });
});

// ============================================================
// H/I · Referrer
// ============================================================
test.describe("atribución por referrer", () => {
  test("H · de document.referrer sale SOLO el hostname", () => {
    expect(externalReferrerHost("https://www.instagram.com/p/abc?igsh=TOKEN", SITE)).toBe(
      "instagram.com",
    );
    expect(externalReferrerHost("https://l.facebook.com/l.php?u=https%3A%2F%2Fx", SITE)).toBe(
      "l.facebook.com",
    );
    expect(externalReferrerHost("https://t.co/aBcD", SITE)).toBe("t.co");
  });

  test("H · nunca sale la URL completa ni la query del referrer", () => {
    const host = externalReferrerHost("https://www.instagram.com/p/abc?igsh=TOKEN123", SITE);
    expect(host).not.toContain("/");
    expect(host).not.toContain("?");
    expect(host).not.toContain("TOKEN123");
  });

  test("I · un referrer interno NO se atribuye como externo", () => {
    expect(externalReferrerHost("https://www.grupovalterra.com.ar/propiedades", SITE)).toBeNull();
    expect(externalReferrerHost("https://grupovalterra.com.ar/", SITE)).toBeNull();
    // www vs apex cuentan como el mismo sitio.
    expect(externalReferrerHost("https://www.grupovalterra.com.ar/", "grupovalterra.com.ar")).toBeNull();
  });

  test("H · entrada directa o referrer inválido → null", () => {
    expect(externalReferrerHost("", SITE)).toBeNull();
    expect(externalReferrerHost(null, SITE)).toBeNull();
    expect(externalReferrerHost("no-es-una-url", SITE)).toBeNull();
  });

  test("el servidor ya NO usa el header Referer del POST", () => {
    // Ese header trae la propia URL de Valterra y destruía la atribución.
    expect(ROUTE).not.toMatch(/referer:\s*request\.headers\.get\(["']referer["']\)/i);
    expect(ROUTE).toContain('selfHost: request.headers.get("host")');
  });

  test("el servidor revalida la FORMA del referrer del cliente", () => {
    expect(cleanReferrerHost("instagram.com")).toBe("instagram.com");
    expect(cleanReferrerHost("WWW.Instagram.COM")).toBe("instagram.com");
    // Si llegara una URL completa, se recorta igual.
    expect(cleanReferrerHost("https://www.instagram.com/p/abc?igsh=T")).toBe("instagram.com");
    // Basura y texto arbitrario: fuera.
    expect(cleanReferrerHost("no es un host")).toBeNull();
    expect(cleanReferrerHost("alguien@ejemplo.com")).toBeNull();
    expect(cleanReferrerHost("localhost")).toBeNull(); // sin punto
    expect(cleanReferrerHost("a".repeat(200) + ".com")).toBeNull();
    expect(cleanReferrerHost(42)).toBeNull();
  });

  test("I · el servidor descarta un referrer igual al propio host", () => {
    const r = validateEvent({
      body: { type: "pageview", path: "/propiedades", referrerHost: "grupovalterra.com.ar" },
      selfHost: "www.grupovalterra.com.ar",
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.event.referrer_host).toBeNull();
  });

  test("un referrer externo sí sobrevive la validación server-side", () => {
    const r = validateEvent({
      body: { type: "pageview", path: "/", referrerHost: "instagram.com" },
      selfHost: "www.grupovalterra.com.ar",
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.event.referrer_host).toBe("instagram.com");
  });
});

// ============================================================
// J/K/L · sessionStorage y cadena de atribución
// ============================================================
test.describe("atribución de sesión", () => {
  test("J · solo se guardan los 4 campos permitidos", () => {
    expect([...ATTRIBUTION_FIELDS]).toEqual([
      "referrer_host",
      "utm_source",
      "utm_medium",
      "utm_campaign",
    ]);
  });

  test("J · lo que venga contaminado en el storage se descarta", () => {
    const sucio = sanitizeAttribution({
      referrer_host: "instagram.com",
      utm_source: "instagram",
      ip: "190.1.2.3",
      email: "alguien@ejemplo.com",
      visit_hash: "deadbeefdeadbeef",
      userAgent: "Mozilla/5.0",
      nombre: "Juan",
      telefono: "3795159096",
      url: "https://x/y?z=1",
    });
    expect(sucio).not.toBeNull();
    const s = JSON.stringify(sucio);
    expect(Object.keys(sucio!).sort()).toEqual([...ATTRIBUTION_FIELDS].sort());
    for (const pii of ["190.1.2.3", "alguien@ejemplo.com", "deadbeef", "Mozilla", "Juan", "3795159096"]) {
      expect(s).not.toContain(pii);
    }
  });

  test("J · sessionStorage, nunca localStorage ni cookies", () => {
    expect(HELPER_CODE).toContain("window.sessionStorage");
    expect(HELPER_CODE).not.toContain("localStorage");
    expect(HELPER_CODE).not.toMatch(/document\.cookie/);
    expect(ATTR_CODE).not.toContain("localStorage");
    expect(ATTR_CODE).not.toMatch(/document\.cookie/);
    expect(ATTRIBUTION_KEY).toBe("vt_attr");
  });

  test("K · una UTM nueva reemplaza la atribución previa", () => {
    const previa: Attribution = {
      referrer_host: "instagram.com",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "campania_vieja",
    };
    const nueva = resolveAttribution(previa, {
      referrerHost: "facebook.com",
      utms: { utm_source: "facebook", utm_medium: "social", utm_campaign: "campania_nueva" },
    });
    expect(nueva).toEqual({
      referrer_host: "facebook.com",
      utm_source: "facebook",
      utm_medium: "social",
      utm_campaign: "campania_nueva",
    });
    // No queda ni un resto de la campaña anterior.
    expect(JSON.stringify(nueva)).not.toContain("campania_vieja");
  });

  test("L · la navegación interna conserva la atribución inicial", () => {
    const inicial: Attribution = {
      referrer_host: "instagram.com",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "lote_paso_patria_202608",
    };
    // Página interna: sin UTM y sin referrer externo.
    const enPropiedad = resolveAttribution(inicial, {
      referrerHost: null,
      utms: { utm_source: null, utm_medium: null, utm_campaign: null },
    });
    expect(enPropiedad).toEqual(inicial);
  });

  test("L · cadena completa Instagram → home → propiedad → WhatsApp", () => {
    // 1. Entrada desde Instagram con campaña.
    let attr = resolveAttribution(null, {
      referrerHost: externalReferrerHost("https://www.instagram.com/grupovalterraar", SITE),
      utms: parseUtms("?utm_source=instagram&utm_medium=social&utm_campaign=lote_202608"),
    });
    // 2. Navega al listado (interno, sin UTM).
    attr = resolveAttribution(attr, {
      referrerHost: externalReferrerHost(`https://${SITE}/`, SITE),
      utms: parseUtms(""),
    });
    // 3. Entra a la ficha.
    attr = resolveAttribution(attr, {
      referrerHost: externalReferrerHost(`https://${SITE}/propiedades`, SITE),
      utms: parseUtms(""),
    });
    // 4. El click de WhatsApp conserva el origen comercial.
    expect(attr).toEqual({
      referrer_host: "instagram.com",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "lote_202608",
    });
  });

  test("sin atribución previa ni UTM: se inicializa con el referrer externo", () => {
    expect(
      resolveAttribution(null, {
        referrerHost: "instagram.com",
        utms: { utm_source: null, utm_medium: null, utm_campaign: null },
      }),
    ).toEqual({
      referrer_host: "instagram.com",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    });
  });

  test("hasUtm: alcanza con un campo", () => {
    expect(hasUtm({ utm_source: "x" })).toBe(true);
    expect(hasUtm({ utm_campaign: "x" })).toBe(true);
    expect(hasUtm({})).toBe(false);
    expect(hasUtm({ referrer_host: "instagram.com" })).toBe(false);
  });

  test("no se crea identidad cross-session ni cross-day", () => {
    // Ningún identificador de visitante en la atribución.
    for (const campo of ["visitor", "visit_hash", "uid", "clientId", "deviceId"]) {
      expect(ATTR_CODE, `attribution.ts no debe manejar ${campo}`).not.toContain(campo);
      expect(HELPER_CODE, `helper no debe manejar ${campo}`).not.toContain(campo);
    }
  });
});

// ============================================================
// M/N/O · WaLink dual emit
// ============================================================
test.describe("WaLink dual emit", () => {
  test("M · conserva el track de Vercel Analytics", () => {
    expect(WALINK).toContain('from "@vercel/analytics"');
    expect(WALINK).toContain('track("wa_click"');
  });

  test("N · además emite a site_events", () => {
    expect(WALINK).toContain("trackSiteEvent");
    expect(WALINK).toContain('trackSiteEvent("wa_click"');
  });

  test("N · las 6 superficies siguen exactas, sin renombrar", () => {
    expect(WA_SOURCES.length).toBe(6);
    for (const s of [
      "card-listado",
      "card-home",
      "ficha",
      "cta-home",
      "footer",
      "footer-contacto",
    ]) {
      expect(WALINK).toContain(`"${s}"`);
      expect(WA_SOURCES as readonly string[]).toContain(s);
    }
  });

  test("O · la navegación a WhatsApp no depende del resultado de analytics", () => {
    // El onClick no previene el default ni espera promesas.
    expect(WALINK).not.toContain("preventDefault");
    expect(WALINK).not.toMatch(/onClick=\{?\s*async/);
    expect(WALINK).not.toMatch(/await\s+trackSiteEvent/);
    // El helper nunca lanza: todo el cuerpo está envuelto en try/catch
    // y el fetch tiene su propio catch.
    expect(HELPER).toContain("keepalive: true");
    expect(HELPER).toContain(".catch(() => {})");
    expect(HELPER).toContain("void fetch(");
  });

  test("O · el helper es fail-silent y no espera la respuesta", () => {
    expect(HELPER).not.toMatch(/await\s+fetch\(/);
    expect(HELPER).not.toContain("throw ");
    expect(HELPER).not.toContain("alert(");
    expect(HELPER).not.toContain("console.error");
  });
});

// ============================================================
// P/Q · Aislamiento y payload
// ============================================================
test.describe("aislamiento y payload", () => {
  test("P · Preview no puede persistir (guard server-side, no del cliente)", () => {
    expect(ROUTE).toContain("isIngestionEnabled(process.env.VERCEL_ENV)");
    // El cliente no manda ninguna pista de entorno que el server pueda creer.
    expect(HELPER).not.toContain("VERCEL_ENV");
    expect(HELPER).not.toContain("NEXT_PUBLIC_VERCEL");
    expect(HELPER).not.toMatch(/env\s*:/);
  });

  test("Q · el payload del cliente no lleva IP, UA ni PII", () => {
    for (const prohibido of [
      "navigator.userAgent",
      "document.cookie",
      "localStorage",
      "location.href",
      "location.search === ",
      "email",
      "phone",
      "telefono",
    ]) {
      expect(HELPER_CODE, `helper no debe contener ${prohibido}`).not.toContain(prohibido);
    }
  });

  test("Q · el payload se arma campo por campo, sin spread del entorno", () => {
    // Ninguna forma de volcar un objeto completo al body.
    expect(HELPER).not.toMatch(/body:\s*JSON\.stringify\(\s*\{\s*\.\.\./);
    expect(HELPER).toContain("const payload: SiteEventPayload");
  });

  test("existe UN solo emisor cliente de site_events", () => {
    // WaLink y el tracker deben importar el helper, no hacer fetch propio.
    expect(WALINK).not.toContain("fetch(");
    expect(TRACKER).not.toContain("fetch(");
    expect(TRACKER).toContain("trackSiteEvent");
  });
});
