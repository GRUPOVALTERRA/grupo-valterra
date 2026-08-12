import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";
import type {
  CampaignRow,
  DailyPoint,
  PropertyRow,
  Scope,
  ScopeTotals,
} from "@/lib/analytics-metrics";
import { EMPTY_TOTALS } from "@/lib/analytics-metrics";

/**
 * VALTERRA DATA & ANALYTICS — repositorio de agregados (S20-PR3).
 *
 * ÚNICO punto de lectura de `site_events`. Habla exclusivamente con las
 * funciones de la migración 0015 y devuelve AGREGADOS.
 *
 * NUNCA devuelve filas crudas de `site_events` ni `visit_hash`. La base
 * agrega, la aplicación interpreta: traer eventos para contarlos acá
 * obligaría a paginar PostgREST y daría métricas incompletas en silencio en
 * cuanto crezca el volumen.
 *
 * ---------------------------------------------------------------------
 * AUTORIZACIÓN
 * ---------------------------------------------------------------------
 * `AnalyticsScope` lo construye SIEMPRE `resolveAnalyticsScope()` a partir
 * de `getAdminContext()`. Nada de lo que llega por query string entra acá
 * sin pasar por esa función: si el ámbito se tomara de la URL, cualquier
 * miembro podría pedir `?ambito=todas` y ver las métricas de las otras
 * inmobiliarias.
 */

/** Ámbito ya autorizado. No se construye a mano en las páginas. */
export interface AnalyticsScope {
  /** 'all' solo puede provenir de un super-admin. */
  mode: "agency" | "all";
  agencyId: string | null;
}

export interface AnalyticsRange {
  from: Date;
  to: Date;
}

function rpcArgs(scope: AnalyticsScope, range: AnalyticsRange) {
  return {
    p_scope: scope.mode,
    p_agency_id: scope.mode === "agency" ? scope.agencyId : null,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  };
}

/** Log saneado: nunca el mensaje crudo del driver (regla de S20-PR1). */
function logRpcError(fn: string, error: { code?: string } | null) {
  log.warn("services/site-events", "rpc fallo", {
    operation: fn,
    code: error?.code ?? "unknown",
  });
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// ============================================================
// Resumen por ámbito
// ============================================================

export interface AnalyticsSummary {
  agency: ScopeTotals;
  general: ScopeTotals;
}

export async function getAnalyticsSummary(
  scope: AnalyticsScope,
  range: AnalyticsRange,
): Promise<AnalyticsSummary> {
  const vacio: AnalyticsSummary = {
    agency: EMPTY_TOTALS("agency"),
    general: EMPTY_TOTALS("general"),
  };
  if (!isSupabaseConfigured()) return vacio;

  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "analytics_summary",
      rpcArgs(scope, range),
    );
    if (error) {
      logRpcError("analytics_summary", error);
      return vacio;
    }

    const salida = { ...vacio };
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const s = row.scope === "general" ? "general" : "agency";
      salida[s] = {
        scope: s as Scope,
        pageviews: n(row.pageviews),
        waClicks: n(row.wa_clicks),
        uniqueVisitors: n(row.unique_visitors),
        identifiablePageviews: n(row.identifiable_pageviews),
      };
    }
    return salida;
  } catch (err) {
    log.error("services/site-events", "excepcion", {
      operation: "analytics_summary",
      kind: err instanceof Error ? err.name : "unknown",
    });
    return vacio;
  }
}

// ============================================================
// Serie diaria
// ============================================================

export async function getAnalyticsDaily(
  scope: AnalyticsScope,
  range: AnalyticsRange,
): Promise<{ agency: DailyPoint[]; general: DailyPoint[] }> {
  const vacio = { agency: [] as DailyPoint[], general: [] as DailyPoint[] };
  if (!isSupabaseConfigured()) return vacio;

  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "analytics_daily",
      rpcArgs(scope, range),
    );
    if (error) {
      logRpcError("analytics_daily", error);
      return vacio;
    }
    const salida = { agency: [] as DailyPoint[], general: [] as DailyPoint[] };
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const s = row.scope === "general" ? "general" : "agency";
      salida[s].push({
        day: String(row.day),
        pageviews: n(row.pageviews),
        waClicks: n(row.wa_clicks),
      });
    }
    return salida;
  } catch {
    return vacio;
  }
}

// ============================================================
// Ranking de propiedades
// ============================================================

export async function getAnalyticsProperties(
  scope: AnalyticsScope,
  range: AnalyticsRange,
  limit = 20,
): Promise<PropertyRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getSupabaseAdmin().rpc("analytics_properties", {
      ...rpcArgs(scope, range),
      p_limit: limit,
    });
    if (error) {
      logRpcError("analytics_properties", error);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      slug: String(row.property_slug),
      title: row.property_title == null ? null : String(row.property_title),
      pageviews: n(row.pageviews),
      waClicks: n(row.wa_clicks),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Campañas
// ============================================================

export async function getAnalyticsCampaigns(
  scope: AnalyticsScope,
  range: AnalyticsRange,
): Promise<CampaignRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "analytics_campaigns",
      rpcArgs(scope, range),
    );
    if (error) {
      logRpcError("analytics_campaigns", error);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      // NULL viaja como null: la etiqueta "Sin campaña" la pone la UI.
      utmSource: row.utm_source == null ? null : String(row.utm_source),
      utmMedium: row.utm_medium == null ? null : String(row.utm_medium),
      utmCampaign: row.utm_campaign == null ? null : String(row.utm_campaign),
      pageviews: n(row.pageviews),
      waClicks: n(row.wa_clicks),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Desgloses web
// ============================================================

export type WebDimension = "path" | "referrer" | "traffic_type" | "wa_source";

export interface WebBreakdownRow {
  scope: Scope;
  dimension: WebDimension;
  label: string;
  events: number;
}

export async function getAnalyticsWeb(
  scope: AnalyticsScope,
  range: AnalyticsRange,
  limit = 10,
): Promise<WebBreakdownRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getSupabaseAdmin().rpc("analytics_web", {
      ...rpcArgs(scope, range),
      p_limit: limit,
    });
    if (error) {
      logRpcError("analytics_web", error);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      scope: (row.scope === "general" ? "general" : "agency") as Scope,
      dimension: String(row.dimension) as WebDimension,
      label: String(row.label),
      events: n(row.events),
    }));
  } catch {
    return [];
  }
}

/** Filtra un desglose por dimensión y ámbito, ya ordenado por la base. */
export function pickDimension(
  rows: WebBreakdownRow[],
  dimension: WebDimension,
  scope?: Scope,
): WebBreakdownRow[] {
  return rows.filter((r) => r.dimension === dimension && (!scope || r.scope === scope));
}
