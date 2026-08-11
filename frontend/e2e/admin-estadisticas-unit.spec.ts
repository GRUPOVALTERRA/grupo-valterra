import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePeriod,
  periodRange,
  periodLabel,
  conversionRate,
  formatPercent,
  estimatedUniques,
  uniquesCoverage,
  formatCount,
  fillDailySeries,
  splitCampaigns,
  campaignLabel,
  sortProperties,
  propertyDisplayName,
  isTaggedCampaign,
  EMPTY_TOTALS,
  PERIODS,
  DEFAULT_PERIOD,
  BUSINESS_TZ,
  NO_CAMPAIGN_LABEL,
  type ScopeTotals,
  type CampaignRow,
} from "../src/lib/analytics-metrics";

/**
 * S20-PR3 — guardas del tablero /admin/estadisticas.
 *
 * Las métricas se prueban como funciones puras; la autorización, el
 * aislamiento y la no-exposición de datos crudos como guardas estáticas
 * sobre los archivos.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PAGE = read("src/app/admin/estadisticas/page.tsx");
const SCOPE = read("src/lib/analytics-scope.ts");
const SERVICE = read("src/services/site-events.ts");
const MIGRATION = read("supabase/migrations/0015_analytics_rpc.sql");
const UI = read("src/components/admin/estadisticas/StatsUI.tsx");

const sql = (s: string) =>
  s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const SQL = sql(MIGRATION);

/**
 * Código TS ejecutable, sin comentarios. Estos archivos documentan en prosa
 * lo que NO hacen ("nunca devuelve visit_hash"), así que buscar esas
 * palabras en el texto crudo daría falsos positivos sobre la propia
 * documentación de la regla.
 */
const codigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

const PAGE_CODE = codigo(PAGE);
const SERVICE_CODE = codigo(SERVICE);
const UI_CODE = codigo(UI);

const totals = (o: Partial<ScopeTotals>): ScopeTotals => ({ ...EMPTY_TOTALS("agency"), ...o });

// ============================================================
// A · Autorización
// ============================================================
test.describe("A · auth obligatoria", () => {
  test("la página resuelve el ámbito por getAdminContext, no por la URL", () => {
    expect(PAGE).toContain("resolveAnalyticsScope");
    expect(SCOPE).toContain("getAdminContext");
    // La página nunca arma un scope a mano.
    expect(PAGE).not.toMatch(/mode:\s*["']all["']/);
    expect(PAGE).not.toMatch(/agencyId:\s*params\./);
  });

  test("sin contexto utilizable redirige a login", () => {
    expect(SCOPE).toContain("if (!ctx.isSuperAdmin && !ctx.userId) return null");
    expect(SCOPE).toContain("if (!ctx.scopedAgencyId) return null");
    expect(PAGE).toContain('redirect("/admin/login');
  });
});

// ============================================================
// B/C · Tenant isolation y super-admin
// ============================================================
test.describe("B/C · aislamiento multi-agencia", () => {
  test("B · el ámbito global exige isSuperAdmin", () => {
    expect(SCOPE).toContain("const isGlobal = ctx.isSuperAdmin && quiereTodas");
    // Nunca `quiereTodas` por sí solo decide.
    expect(SCOPE).not.toMatch(/isGlobal\s*=\s*quiereTodas/);
  });

  test("C · un miembro común queda en su agencia aunque pida todas", () => {
    expect(SCOPE).toContain('scope: { mode: "agency", agencyId: ctx.scopedAgencyId }');
    expect(SCOPE).toContain("canSwitchScope: ctx.isSuperAdmin");
  });

  test("el RPC filtra por agencia en la base, no en la aplicación", () => {
    expect(SQL).toContain("p_scope = 'agency' and v.agency_id = p_agency_id");
    expect(SQL).toContain("p_scope = 'all'");
  });
});

// ============================================================
// D/E/F · Totales y únicos
// ============================================================
test.describe("D/E/F · KPIs", () => {
  test("D · conversión con denominador válido", () => {
    expect(conversionRate(2, 10)).toBeCloseTo(20);
    expect(formatPercent(conversionRate(2, 10))).toBe("20.0%");
  });

  test("E · únicos estimados sobre eventos identificables", () => {
    expect(estimatedUniques(totals({ pageviews: 10, identifiablePageviews: 8, uniqueVisitors: 5 }))).toBe(5);
    expect(uniquesCoverage(totals({ pageviews: 10, identifiablePageviews: 8 }))).toBeCloseTo(80);
  });

  test("F · visit_hash NULL en todo el período → Sin datos, NUNCA 0", () => {
    const sinHash = totals({ pageviews: 12, identifiablePageviews: 0, uniqueVisitors: 0 });
    expect(estimatedUniques(sinHash)).toBeNull();
    expect(formatCount(estimatedUniques(sinHash))).toBe("Sin datos");
    // El caso peligroso: si mostrara 0 diría "no entró nadie", que es falso.
    expect(formatCount(estimatedUniques(sinHash))).not.toBe("0");
  });

  test("F · sin pageviews tampoco inventa únicos", () => {
    expect(estimatedUniques(EMPTY_TOTALS("agency"))).toBeNull();
    expect(uniquesCoverage(EMPTY_TOTALS("general"))).toBeNull();
  });

  test("G · los wa_click se cuentan por separado del pageview", () => {
    expect(SQL).toContain("count(*) filter (where v.event_type = 'wa_click')");
    expect(SQL).toContain("count(*) filter (where v.event_type = 'pageview')");
  });
});

// ============================================================
// H/I · Conversión
// ============================================================
test.describe("H/I · conversión", () => {
  test("H · pageviews > 0 y WA = 0 es 0%, no N/D", () => {
    expect(conversionRate(0, 25)).toBe(0);
    expect(formatPercent(conversionRate(0, 25))).toBe("0.0%");
  });

  test("I · propiedad sin pageviews → N/D", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(formatPercent(conversionRate(0, 0))).toBe("N/D");
    expect(formatPercent(conversionRate(3, 0))).toBe("N/D");
  });
});

// ============================================================
// J/K · Campañas
// ============================================================
test.describe("J/K · campañas", () => {
  const rows: CampaignRow[] = [
    { utmSource: "instagram", utmMedium: "social", utmCampaign: "lote_202608", pageviews: 10, waClicks: 3 },
    { utmSource: null, utmMedium: null, utmCampaign: null, pageviews: 90, waClicks: 1 },
    { utmSource: "facebook", utmMedium: "social", utmCampaign: "camp_b", pageviews: 20, waClicks: 5 },
    { utmSource: null, utmMedium: null, utmCampaign: null, pageviews: 5, waClicks: 0 },
  ];

  test("J · las etiquetadas se ordenan por WA y luego por visitas", () => {
    const { tagged } = splitCampaigns(rows);
    expect(tagged.map((c) => c.utmCampaign)).toEqual(["camp_b", "lote_202608"]);
  });

  test("K · NULL no se convierte en campaña ficticia y va aparte", () => {
    const { tagged, untagged } = splitCampaigns(rows);
    expect(tagged.every(isTaggedCampaign)).toBe(true);
    expect(tagged.some((c) => c.utmCampaign === null)).toBe(false);
    // El tráfico sin UTM se consolida en una fila separada.
    expect(untagged).not.toBeNull();
    expect(untagged!.pageviews).toBe(95);
    expect(campaignLabel(untagged!)).toBe(NO_CAMPAIGN_LABEL);
  });

  test("K · sin tráfico sin-campaña, untagged es null (no una fila en cero)", () => {
    expect(splitCampaigns([rows[0]]).untagged).toBeNull();
  });

  test("K · el RPC devuelve NULL como NULL", () => {
    expect(SQL).toContain("v.utm_source,");
    expect(SQL).not.toMatch(/coalesce\(\s*v\.utm_campaign\s*,\s*'/i);
  });
});

// ============================================================
// L · Superficies de WhatsApp
// ============================================================
test("L · las 6 superficies llegan sin renombrar", () => {
  // El RPC agrupa por `source` tal cual está en la base; el check de 0014
  // ya restringe los valores posibles a las 6 de WaSource.
  expect(SQL).toContain("select scope, 'wa_source', source, count(*)");
  expect(SQL).not.toMatch(/case\s+source\s+when/i);
  expect(UI_CODE).not.toMatch(/card-listado|footer-contacto/); // la UI no los reescribe
});

// ============================================================
// M/R/S · agency_id NULL
// ============================================================
test.describe("M/R/S · tratamiento de agency_id NULL", () => {
  test("M · NULL se etiqueta 'general', no se descarta ni se imputa", () => {
    expect(SQL).toContain("case when v.agency_id is null then 'general' else 'agency' end");
  });

  test("R · la conversión de agencia nunca mezcla el tráfico general", () => {
    // Se calcula sobre `ag` (bloque agencia) y sobre `gen` por separado.
    expect(PAGE).toContain("conversionRate(ag.waClicks, ag.pageviews)");
    expect(PAGE).toContain("conversionRate(gen.waClicks, gen.pageviews)");
    // Nunca un denominador que sume ambos.
    expect(PAGE).not.toMatch(/ag\.pageviews\s*\+\s*gen\.pageviews\s*\)/);
    expect(PAGE).not.toMatch(/conversionRate\([^)]*\+[^)]*\)/);
  });

  test("R · el ranking de propiedades excluye el tráfico sin propiedad", () => {
    expect(SQL).toContain("and v.property_slug is not null");
  });

  test("R · el gráfico combinado se rotula como volumen, no como conversión", () => {
    // Decisión aprobada: sumar general + ámbito está permitido SOLO como
    // volumen observado. El rótulo tiene que decirlo para que nadie lo lea
    // como una tasa de la inmobiliaria.
    expect(PAGE).toContain("Tráfico observado · sitio general + ámbito seleccionado");
    expect(PAGE).toMatch(/nunca se usa como denominador/i);
  });

  test("R · la tab WEB se rotula como contexto del sitio", () => {
    expect(PAGE).toMatch(/Contexto del sitio/);
    expect(PAGE).toMatch(/nunca incluye eventos de otra inmobiliaria/i);
  });

  test("S · en ámbito global se conserva la dimensión NULL/agencias", () => {
    // El group by mantiene el scope incluso con p_scope='all'.
    expect(SQL).toMatch(/group by 1\b/);
    expect(PAGE).toContain("summary.agency");
    expect(PAGE).toContain("summary.general");
  });
});

// ============================================================
// N/O · Estados vacíos y períodos
// ============================================================
test.describe("N/O · vacío y períodos", () => {
  test("N · empty state explícito, sin skeleton infinito", () => {
    expect(PAGE).toContain("totalEventos === 0");
    expect(UI_CODE).toContain("EmptyState");
    expect(UI_CODE).not.toContain("animate-pulse");
  });

  test("O · períodos 1/7/30 con default 7", () => {
    expect([...PERIODS]).toEqual(["hoy", "7", "30"]);
    expect(DEFAULT_PERIOD).toBe("7");
    expect(parsePeriod(undefined)).toBe("7");
    expect(parsePeriod("basura")).toBe("7");
    expect(parsePeriod("30")).toBe("30");
    expect(periodLabel("hoy")).toBe("Hoy");
  });

  test("O · el rango cubre la cantidad de días pedida", () => {
    const dia = 24 * 3600 * 1000;
    const ahora = new Date("2026-08-11T18:00:00Z");
    const r7 = periodRange("7", ahora);
    expect(Math.round((r7.to.getTime() - r7.from.getTime()) / dia)).toBe(7);
    expect(Math.round((periodRange("30", ahora).to.getTime() - periodRange("30", ahora).from.getTime()) / dia)).toBe(30);
    expect(Math.round((periodRange("hoy", ahora).to.getTime() - periodRange("hoy", ahora).from.getTime()) / dia)).toBe(1);
  });
});

// ============================================================
// V · Timezone
// ============================================================
test.describe("V · día comercial argentino", () => {
  test("el RPC corta los días en America/Argentina/Cordoba", () => {
    expect(SQL).toContain("at time zone 'America/Argentina/Cordoba'");
    expect(BUSINESS_TZ).toBe("America/Argentina/Cordoba");
  });

  test("el rango de 'hoy' empieza a medianoche ART (03:00 UTC)", () => {
    // 2026-08-11 18:00Z = 15:00 ART -> el día ART empezó a las 03:00Z.
    const { from, to } = periodRange("hoy", new Date("2026-08-11T18:00:00Z"));
    expect(from.toISOString()).toBe("2026-08-11T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-12T03:00:00.000Z");
  });

  test("un evento de las 23:00 ART pertenece al día local, no al siguiente", () => {
    // 2026-08-11T02:00Z = 2026-08-10 23:00 ART.
    const { from, to } = periodRange("hoy", new Date("2026-08-10T23:00:00Z"));
    const evento = new Date("2026-08-11T02:00:00Z");
    expect(evento >= from && evento < to).toBe(true);
  });

  test("la serie diaria rellena los días sin eventos", () => {
    const from = new Date("2026-08-09T03:00:00Z");
    const to = new Date("2026-08-12T03:00:00Z");
    const serie = fillDailySeries([{ day: "2026-08-10", pageviews: 4, waClicks: 1 }], from, to);
    expect(serie.map((p) => p.day)).toEqual(["2026-08-09", "2026-08-10", "2026-08-11"]);
    expect(serie[0].pageviews).toBe(0);
    expect(serie[1].pageviews).toBe(4);
  });
});

// ============================================================
// P/T/U/W · Privacidad y forma de los datos
// ============================================================
test.describe("P/T/U/W · privacidad y agregación", () => {
  test("P/T · visit_hash nunca sale de la base ni se muestra", () => {
    // El RPC solo lo usa dentro de count(distinct ...).
    expect(SQL).toContain("count(distinct v.visit_hash)");
    expect(SQL).not.toMatch(/^\s*(select|,)\s*v?\.?visit_hash\s*(,|$)/m);
    expect(SERVICE_CODE).not.toMatch(/visit_hash/);
    expect(PAGE_CODE).not.toMatch(/visit_hash/);
    expect(UI_CODE).not.toMatch(/visit_hash/);
  });

  test("P · no se exponen IP, user-agent ni UUID de agencia en la UI", () => {
    for (const t of [PAGE_CODE, UI_CODE]) {
      expect(t).not.toMatch(/\bip\b\s*[:=]/);
      expect(t).not.toMatch(/user_agent|userAgent/);
      expect(t).not.toMatch(/agency_id/);
    }
    // La propiedad se identifica por título o slug, nunca por id.
    expect(propertyDisplayName({ slug: "casa-1", title: null, pageviews: 0, waClicks: 0 })).toBe("casa-1");
    expect(propertyDisplayName({ slug: "casa-1", title: "Casa del río", pageviews: 0, waClicks: 0 })).toBe("Casa del río");
  });

  test("U · el servicio nunca lee site_events directamente", () => {
    // Todo pasa por las funciones de 0015.
    expect(SERVICE_CODE).not.toMatch(/\.from\(["']site_events["']\)/);
    for (const fn of [
      "analytics_summary",
      "analytics_daily",
      "analytics_properties",
      "analytics_campaigns",
      "analytics_web",
    ]) {
      expect(SERVICE_CODE, `el servicio debe llamar ${fn}`).toMatch(
        new RegExp(`\\.rpc\\(\\s*"${fn}"`),
      );
    }
  });

  test("W · la agregación ocurre en SQL, no paginando en el cliente", () => {
    expect(SERVICE_CODE).not.toMatch(/\.range\(/);
    expect(SERVICE_CODE).not.toMatch(/\.limit\(\s*\d{4,}\s*\)/);
    // El límite viaja como parámetro del RPC, acotado en la base.
    expect(SQL).toContain("least(greatest(coalesce(p_limit");
  });

  test("las funciones son SECURITY INVOKER y sin EXECUTE público", () => {
    const definers = (SQL.match(/security definer/gi) ?? []).length;
    expect(definers).toBe(0);
    expect((SQL.match(/security invoker/gi) ?? []).length).toBe(5);
    expect(SQL).toContain("security_invoker = true");
    expect(SQL).toContain("revoke all on function");
  });
});

// ============================================================
// Migración 0015 — forma
// ============================================================
test.describe("migración 0015", () => {
  test("es aditiva: no toca datos ni tablas existentes", () => {
    expect(SQL).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(SQL).not.toMatch(/alter table/i);
    expect(SQL).not.toMatch(/drop (table|column)/i);
  });

  test("deriva property_slug del path (los pageviews no lo mandan)", () => {
    expect(SQL).toContain("substring(e.path from '^/propiedades/([^/]+)$')");
    expect(SQL).toContain("coalesce(e.agency_id, p.agency_id)");
  });

  test("ordena el ranking por WA y luego por visitas", () => {
    expect(SQL).toContain("order by 4 desc, 3 desc, 1");
    const rows = sortProperties([
      { slug: "b", title: null, pageviews: 100, waClicks: 1 },
      { slug: "a", title: null, pageviews: 5, waClicks: 9 },
    ]);
    expect(rows[0].slug).toBe("a");
  });
});
