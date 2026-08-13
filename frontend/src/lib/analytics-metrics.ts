/**
 * VALTERRA DATA & ANALYTICS — reglas de presentación del tablero (S20-PR3).
 *
 * Módulo PURO: sin Supabase, sin Next, sin DOM. Acá vive todo lo que decide
 * QUÉ significa un número, para poder probarlo sin base ni navegador.
 *
 * La agregación la hace PostgreSQL (migración 0015). Este módulo solo
 * interpreta agregados: convierte conteos en porcentajes, decide cuándo un
 * valor es "N/D" y separa lo que nunca debe sumarse.
 */

// ============================================================
// Períodos
// ============================================================

export const PERIODS = ["hoy", "7", "30"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "7";

/** Zona horaria comercial. ART = UTC-3 todo el año (Argentina no usa DST). */
export const BUSINESS_TZ = "America/Argentina/Cordoba";
const ART_OFFSET_HOURS = 3;

export function parsePeriod(raw: unknown): Period {
  return (PERIODS as readonly string[]).includes(raw as string)
    ? (raw as Period)
    : DEFAULT_PERIOD;
}

/**
 * Convierte un período en un rango [from, to) en UTC, cortado por día
 * COMERCIAL argentino.
 *
 * Por qué no se corta por UTC: a las 21:00 de Argentina ya es el día
 * siguiente en UTC. Con corte UTC, toda la actividad de la noche —justo
 * cuando la gente mira propiedades— aparecería como tráfico de mañana, y
 * "hoy" mostraría un número incompleto hasta las 21hs.
 */
export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date } {
  // Medianoche ART del día actual, expresada en UTC.
  const art = new Date(now.getTime() - ART_OFFSET_HOURS * 3_600_000);
  const inicioDiaArtUtc = Date.UTC(
    art.getUTCFullYear(),
    art.getUTCMonth(),
    art.getUTCDate(),
  ) + ART_OFFSET_HOURS * 3_600_000;

  const to = new Date(inicioDiaArtUtc + 24 * 3_600_000); // fin del día de hoy
  const dias = period === "hoy" ? 1 : period === "7" ? 7 : 30;
  return { from: new Date(inicioDiaArtUtc - (dias - 1) * 24 * 3_600_000), to };
}

export function periodLabel(period: Period): string {
  return period === "hoy" ? "Hoy" : period === "7" ? "Últimos 7 días" : "Últimos 30 días";
}

// ============================================================
// Ámbitos — lo que NUNCA se suma
// ============================================================

/**
 * `agency`  = eventos con agency_id resuelto (fichas de propiedad).
 * `general` = agency_id NULL: home, listado, footer. El PORTAL, no una
 *             inmobiliaria en particular.
 *
 * Se mantienen separados a propósito. Sumar los pageviews del portal con
 * los wa_click de una agencia daría una conversión inventada: el
 * denominador incluiría visitas que nunca vieron esa propiedad.
 */
export type Scope = "agency" | "general";

export interface ScopeTotals {
  scope: Scope;
  pageviews: number;
  waClicks: number;
  uniqueVisitors: number;
  identifiablePageviews: number;
}

export const EMPTY_TOTALS = (scope: Scope): ScopeTotals => ({
  scope,
  pageviews: 0,
  waClicks: 0,
  uniqueVisitors: 0,
  identifiablePageviews: 0,
});

// ============================================================
// Métricas derivadas
// ============================================================

/** Valor que la UI debe mostrar como "N/D" / "Sin datos". */
export const NO_DATA = null;

/**
 * Conversión WhatsApp / pageviews, en porcentaje.
 *
 *   pageviews = 0            -> null  (N/D: no hay denominador)
 *   pageviews > 0, WA = 0    -> 0     (hubo visitas y nadie consultó: es un
 *                                      dato real, no ausencia de dato)
 */
export function conversionRate(waClicks: number, pageviews: number): number | null {
  if (!Number.isFinite(pageviews) || pageviews <= 0) return NO_DATA;
  return (waClicks / pageviews) * 100;
}

export function formatPercent(value: number | null, digits = 1): string {
  return value === null ? "N/D" : `${value.toFixed(digits)}%`;
}

/**
 * Visitantes únicos ESTIMADOS.
 *
 * Solo se cuentan eventos con `visit_hash`, que es un pseudónimo diario y
 * opcional. Tres situaciones distintas que no hay que confundir:
 *
 *   sin pageviews               -> null  ("Sin datos")
 *   pageviews pero 0 identificables -> null  ("Sin datos")  <- NUNCA 0
 *   pageviews con identificables    -> el conteo, siempre una ESTIMACIÓN
 *
 * El segundo caso es el que importa: si `EVENTS_HASH_SALT` no estuviera
 * configurada, todos los hash serían NULL y mostrar "0 visitantes únicos"
 * sería afirmar que nadie entró. Es falso: significa que no podemos
 * estimarlo.
 */
export function estimatedUniques(t: ScopeTotals): number | null {
  if (t.pageviews <= 0) return NO_DATA;
  if (t.identifiablePageviews <= 0) return NO_DATA;
  return t.uniqueVisitors;
}

/** Qué proporción del período es estimable. Alimenta el tooltip. */
export function uniquesCoverage(t: ScopeTotals): number | null {
  if (t.pageviews <= 0) return NO_DATA;
  return (t.identifiablePageviews / t.pageviews) * 100;
}

export function formatCount(value: number | null): string {
  return value === null ? "Sin datos" : new Intl.NumberFormat("es-AR").format(value);
}

// ============================================================
// Campañas
// ============================================================

export interface CampaignRow {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  pageviews: number;
  waClicks: number;
}

/** Etiqueta visible. NULL no se convierte en una campaña ficticia. */
export const NO_CAMPAIGN_LABEL = "Sin campaña";

export function isTaggedCampaign(r: CampaignRow): boolean {
  return Boolean(r.utmSource || r.utmMedium || r.utmCampaign);
}

/**
 * Separa campañas etiquetadas del tráfico sin UTM.
 *
 * El tráfico sin campaña suele ser el más voluminoso; mezclarlo en el
 * ranking lo pondría siempre primero y haría parecer que "Sin campaña" es
 * la campaña más exitosa del negocio.
 */
export function splitCampaigns(rows: CampaignRow[]): {
  tagged: CampaignRow[];
  untagged: CampaignRow | null;
} {
  const tagged = rows.filter(isTaggedCampaign);
  const sinUtm = rows.filter((r) => !isTaggedCampaign(r));

  const untagged = sinUtm.length
    ? sinUtm.reduce<CampaignRow>(
        (acc, r) => ({
          ...acc,
          pageviews: acc.pageviews + r.pageviews,
          waClicks: acc.waClicks + r.waClicks,
        }),
        { utmSource: null, utmMedium: null, utmCampaign: null, pageviews: 0, waClicks: 0 },
      )
    : null;

  tagged.sort((a, b) => b.waClicks - a.waClicks || b.pageviews - a.pageviews);
  return { tagged, untagged };
}

export function campaignLabel(r: CampaignRow): string {
  if (!isTaggedCampaign(r)) return NO_CAMPAIGN_LABEL;
  return [r.utmSource, r.utmMedium, r.utmCampaign].filter(Boolean).join(" · ");
}

// ============================================================
// Redes sociales (S20-PR4)
// ============================================================

export interface SocialRow {
  /** Id de red tal como lo devuelve `analytics_social`. */
  network: string;
  pageviews: number;
  waClicks: number;
}

/**
 * Ordena por consultas de WhatsApp y después por visitas.
 *
 * Mismo criterio que el ranking de propiedades: lo que importa
 * comercialmente es de qué red salen consultas, no cuál trajo más
 * curiosos.
 */
export function sortSocial(rows: SocialRow[]): SocialRow[] {
  return [...rows].sort(
    (a, b) => b.waClicks - a.waClicks || b.pageviews - a.pageviews || a.network.localeCompare(b.network),
  );
}

/** Suma de un conjunto de filas de red, para la fila de total. */
export function totalSocial(rows: SocialRow[]): { pageviews: number; waClicks: number } {
  return rows.reduce(
    (acc, r) => ({ pageviews: acc.pageviews + r.pageviews, waClicks: acc.waClicks + r.waClicks }),
    { pageviews: 0, waClicks: 0 },
  );
}

// ============================================================
// Propiedades
// ============================================================

export interface PropertyRow {
  slug: string;
  title: string | null;
  pageviews: number;
  waClicks: number;
}

/** Orden del ranking: intención comercial primero, atención después. */
export function sortProperties(rows: PropertyRow[]): PropertyRow[] {
  return [...rows].sort(
    (a, b) => b.waClicks - a.waClicks || b.pageviews - a.pageviews || a.slug.localeCompare(b.slug),
  );
}

/** Nunca se muestra un UUID: si falta el título, el slug es el identificador. */
export function propertyDisplayName(r: PropertyRow): string {
  return r.title?.trim() || r.slug;
}

// ============================================================
// Serie diaria
// ============================================================

export interface DailyPoint {
  day: string; // YYYY-MM-DD (día comercial ART)
  pageviews: number;
  waClicks: number;
}

/**
 * Rellena los días sin eventos con ceros.
 *
 * Un gráfico que solo dibuja los días con actividad miente sobre la forma
 * de la curva: dos visitas separadas por una semana parecerían días
 * consecutivos.
 */
export function fillDailySeries(
  points: DailyPoint[],
  from: Date,
  to: Date,
): DailyPoint[] {
  const porDia = new Map(points.map((p) => [p.day, p]));
  const salida: DailyPoint[] = [];

  const cursor = new Date(from.getTime());
  while (cursor < to) {
    const art = new Date(cursor.getTime() - ART_OFFSET_HOURS * 3_600_000);
    const key = art.toISOString().slice(0, 10);
    salida.push(porDia.get(key) ?? { day: key, pageviews: 0, waClicks: 0 });
    cursor.setTime(cursor.getTime() + 24 * 3_600_000);
  }
  return salida;
}
