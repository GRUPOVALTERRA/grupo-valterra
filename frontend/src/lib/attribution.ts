/**
 * VALTERRA DATA & ANALYTICS — atribución comercial (S20-PR2).
 *
 * Módulo PURO: sin DOM, sin fetch, sin Next. Todo lo que decide de dónde
 * vino una visita vive acá, para que las guardas de e2e puedan probarlo sin
 * levantar un navegador. El wrapper que sí toca `window` es
 * `src/components/analytics/trackSiteEvent.ts`.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ EXISTE — el defecto que corrige
 * ---------------------------------------------------------------------
 * Hasta S20-PR1, `referrer_host` se derivaba del header HTTP `Referer` del
 * POST a /api/events. Eso NO sirve: el POST lo dispara una página de
 * Valterra, así que el header trae la propia URL de Valterra, no
 * instagram.com. La atribución social quedaba destruida — todo el tráfico
 * parecía venir de nosotros mismos.
 *
 * La única fuente real del referrer externo es `document.referrer` en el
 * navegador, leído en la PRIMERA carga de la sesión. Por eso se manda desde
 * el cliente. El servidor revalida la forma pero no puede reconstruirlo.
 *
 * Que el cliente pueda mentir es aceptable y está asumido: `site_events` es
 * TELEMETRÍA OBSERVADA, no una fuente antifraude ni contable. Lo que NO se
 * delega al cliente es `agency_id`, que sigue siendo server-derived: ahí sí
 * una mentira rompería el scoping multi-agencia del tablero.
 *
 * ---------------------------------------------------------------------
 * PRIVACIDAD
 * ---------------------------------------------------------------------
 * De `document.referrer` se extrae SOLO el hostname y se descarta el resto
 * en el mismo paso. Una URL de referencia completa suele arrastrar
 * identificadores de sesión o de campaña personalizados (`?igsh=...`); esa
 * URL nunca sale del navegador ni se guarda.
 *
 * La atribución se persiste en `sessionStorage` y SOLO con cuatro campos.
 * Nada de IP, user-agent, email, teléfono, nombre, visitor id, `visit_hash`,
 * URL completa ni query completa. `sessionStorage` muere al cerrar la
 * pestaña: no crea identidad cross-session ni cross-day, y no es una cookie.
 */

// ============================================================
// Forma de la atribución
// ============================================================

/** Los ÚNICOS cuatro campos que se guardan. Ver PRIVACIDAD. */
export interface Attribution {
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export const ATTRIBUTION_KEY = "vt_attr";

/** Claves permitidas en el objeto guardado. Nada fuera de esta lista. */
export const ATTRIBUTION_FIELDS = [
  "referrer_host",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

export const EMPTY_ATTRIBUTION: Attribution = {
  referrer_host: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
};

const MAX = {
  referrerHost: 120,
  utmSource: 80,
  utmMedium: 80,
  utmCampaign: 120,
} as const;

const CONTROL_CHARS_G = /[\u0000-\u001F\u007F]/g;

/** Texto corto saneado, o null. */
function clean(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(CONTROL_CHARS_G, "");
  if (!value) return null;
  return value.slice(0, maxLen);
}

// ============================================================
// Referrer externo
// ============================================================

/** Quita el `www.` inicial y normaliza a minúsculas. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Convierte `document.referrer` en un hostname externo, o null.
 *
 * Devuelve null cuando:
 *   * no hay referrer (entrada directa, marcador, app sin referrer);
 *   * no es una URL parseable;
 *   * es INTERNO — el mismo host que la página actual. Una navegación de
 *     /propiedades a la ficha no es una fuente de tráfico: contarla como
 *     tal inflaría "vino de grupovalterra.com.ar" y taparía el origen real.
 *
 * `currentHost` se compara ya normalizado, así que `www.grupovalterra.com.ar`
 * y `grupovalterra.com.ar` cuentan como el mismo sitio.
 *
 * NUNCA devuelve la URL completa: solo el hostname.
 */
export function externalReferrerHost(
  documentReferrer: unknown,
  currentHost: unknown,
): string | null {
  if (typeof documentReferrer !== "string" || !documentReferrer) return null;

  let host: string;
  try {
    host = normalizeHost(new URL(documentReferrer).hostname);
  } catch {
    return null;
  }
  if (!host || host.length > MAX.referrerHost) return null;

  if (typeof currentHost === "string" && currentHost) {
    if (host === normalizeHost(currentHost)) return null; // interno
  }

  return host;
}

// ============================================================
// UTM
// ============================================================

/**
 * Extrae las UTM de una query string.
 *
 * Solo se leen las tres que el modelo guarda. `utm_term` y `utm_content`
 * se ignoran a propósito: no están en `site_events` y no queremos guardar
 * parámetros arbitrarios, que es por donde se cuela PII de terceros.
 */
export function parseUtms(search: unknown): Pick<
  Attribution,
  "utm_source" | "utm_medium" | "utm_campaign"
> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(typeof search === "string" ? search : "");
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  return {
    utm_source: clean(params.get("utm_source"), MAX.utmSource),
    utm_medium: clean(params.get("utm_medium"), MAX.utmMedium),
    utm_campaign: clean(params.get("utm_campaign"), MAX.utmCampaign),
  };
}

/** ¿La entrada trae una campaña nueva? Alcanza con un campo UTM presente. */
export function hasUtm(utms: Partial<Attribution>): boolean {
  return Boolean(utms.utm_source || utms.utm_medium || utms.utm_campaign);
}

// ============================================================
// Resolución de la atribución de la sesión
// ============================================================

/**
 * Decide la atribución vigente.
 *
 * Reglas (en este orden):
 *
 *  1. Si la entrada trae UTM nueva válida, esa campaña REEMPLAZA por
 *     completo la atribución anterior. La última campaña que trajo a la
 *     persona es la que se lleva el crédito; mezclar campos de dos campañas
 *     produciría una atribución que nunca existió.
 *
 *  2. Si no hay UTM nueva y ya había atribución guardada, se REUTILIZA tal
 *     cual. Esto es lo que sostiene la cadena Instagram → home → propiedad
 *     → WhatsApp: las páginas internas no traen UTM ni referrer externo, y
 *     sin esta regla el click de WhatsApp quedaría sin origen.
 *
 *  3. Si no hay nada guardado, se inicializa con el referrer externo de
 *     esta carga (que puede ser null: entrada directa).
 */
export function resolveAttribution(
  stored: Attribution | null,
  entry: { referrerHost: string | null; utms: Pick<Attribution, "utm_source" | "utm_medium" | "utm_campaign"> },
): Attribution {
  if (hasUtm(entry.utms)) {
    return {
      referrer_host: entry.referrerHost,
      utm_source: entry.utms.utm_source,
      utm_medium: entry.utms.utm_medium,
      utm_campaign: entry.utms.utm_campaign,
    };
  }

  if (stored) return stored;

  return {
    referrer_host: entry.referrerHost,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  };
}

/**
 * Sanea lo leído de sessionStorage.
 *
 * El contenido de sessionStorage es editable por cualquiera desde la
 * consola, así que se trata como entrada no confiable: se reconstruye campo
 * por campo desde la allowlist y se descarta todo lo demás. Si alguien
 * inyectó `email` o `visit_hash` ahí, no sobrevive a esta función.
 */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const attribution: Attribution = {
    referrer_host: clean(o.referrer_host, MAX.referrerHost),
    utm_source: clean(o.utm_source, MAX.utmSource),
    utm_medium: clean(o.utm_medium, MAX.utmMedium),
    utm_campaign: clean(o.utm_campaign, MAX.utmCampaign),
  };

  const vacia = ATTRIBUTION_FIELDS.every((f) => attribution[f] === null);
  return vacia ? null : attribution;
}
