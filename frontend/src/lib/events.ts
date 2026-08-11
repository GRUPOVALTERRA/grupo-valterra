import { createHash } from "node:crypto";

/**
 * Analitica F2 (S20) — nucleo de validacion del log propio de eventos.
 *
 * Modulo PURO y server-only: sin I/O, sin Supabase, sin Next. Todo lo que
 * decide que entra a `site_events` vive aca, para que las guardas de
 * e2e/site-events-unit.spec.ts puedan probarlo sin levantar la app.
 *
 * REGLA RECTORA: el cliente propone, el servidor dispone. Cualquier campo
 * que pueda mentir (agency_id, referrer, path con query) se deriva o se
 * sanea aca; lo que no entra en la allowlist se descarta en silencio.
 *
 * PRIVACIDAD: este modulo NUNCA devuelve IP ni user-agent. Los recibe solo
 * para derivar `visitHash`, un identificador pseudonimo diario (ver la
 * documentacion de esa funcion, que aclara tambien lo que NO garantiza).
 *
 * NATURALEZA DEL DATO: lo que sale de aca es TELEMETRIA OBSERVADA de un
 * endpoint publico, no contabilidad. La validacion reduce el ruido; no
 * convierte un evento en prueba de que hubo una persona real del otro lado.
 */

// ============================================================
// Allowlists — espejo exacto de la migracion 0014 y de WaSource.
// ============================================================

export const EVENT_TYPES = ["pageview", "wa_click"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Espejo de WaSource en src/components/public/WaLink.tsx. */
export const WA_SOURCES = [
  "card-listado",
  "card-home",
  "ficha",
  "cta-home",
  "footer",
  "footer-contacto",
] as const;
export type EventSource = (typeof WA_SOURCES)[number];

/**
 * Caracteres de control (C0 + DEL). Se rechazan/limpian siempre: un \n en
 * un campo que despues va al log permite inyectar lineas falsas, y un NUL
 * rompe el driver de Postgres.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const CONTROL_CHARS_G = /[\u0000-\u001F\u007F]/g;

const MAX = {
  path: 300,
  propertySlug: 120,
  referrerHost: 120,
  utmSource: 80,
  utmMedium: 80,
  utmCampaign: 120,
} as const;

// ============================================================
// Forma del evento ya validado (lo que se inserta en site_events).
// ============================================================

export interface SiteEventRow {
  event_type: EventType;
  path: string;
  property_slug: string | null;
  source: EventSource | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export type EventValidation =
  | { valid: true; event: SiteEventRow }
  | { valid: false; reason: EventRejectReason };

/** Motivo del descarte. Se registra en logs, NUNCA se devuelve al cliente. */
export type EventRejectReason =
  | "tipo-desconocido"
  | "source-invalida"
  | "source-en-pageview"
  | "source-faltante"
  | "path-invalido"
  | "path-admin";

// ============================================================
// Normalizadores
// ============================================================

/**
 * Normaliza la ruta: sin origen, sin query string, sin fragmento.
 *
 * Se descarta la query a proposito: es el lugar clasico donde viajan
 * tokens, emails y otros datos personales metidos por terceros. Las UTM
 * que interesan llegan por su propio campo, ya saneadas.
 *
 * Devuelve null si la ruta no es una ruta publica valida.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  let path = raw.trim();
  if (!path) return null;

  // Acepta URL absoluta del propio sitio y se queda con el pathname.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }

  // Corta query y fragmento.
  path = path.split("?")[0].split("#")[0];

  if (!path.startsWith("/")) return null;
  // Un "//host" es una URL protocol-relative disfrazada de ruta.
  if (path.startsWith("//")) return null;
  if (path.includes("..")) return null;
  if (path.includes("\\")) return null;
  // Caracteres de control (incluye \n: defensa contra log injection).
  if (CONTROL_CHARS.test(path)) return null;

  // Colapsa la barra final salvo en la raiz, para que "/propiedades" y
  // "/propiedades/" no cuenten como dos rutas distintas en el tablero.
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  if (path.length > MAX.path) return null;

  return path;
}

/** true si la ruta pertenece al panel admin (nunca se instrumenta). */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * Extrae SOLO el host del header Referer.
 *
 * Guardar la URL de referencia completa seria guardar PII de rebote: esas
 * URLs suelen traer identificadores de sesion o de campana personalizados.
 * Del origen del trafico alcanza con saber "vino de instagram.com".
 */
export function referrerHost(referer: unknown): string | null {
  if (typeof referer !== "string" || !referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host.length > MAX.referrerHost) return null;
    return host;
  } catch {
    return null;
  }
}

/** Texto corto saneado: sin control chars, recortado, o null. */
function cleanText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(CONTROL_CHARS_G, "");
  if (!value) return null;
  return value.slice(0, maxLen);
}

/** Slug de propiedad saneado: alfanumerico, guiones y guion bajo. */
export function cleanPropertySlug(raw: unknown): string | null {
  const value = cleanText(raw, MAX.propertySlug);
  if (!value) return null;
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}

/**
 * IDENTIFICADOR PSEUDONIMO DIARIO derivado de IP y user-agent con una sal
 * secreta, sin persistir los valores originales.
 *
 * Como la fecha UTC entra en el material del hash, el valor ROTA CADA DIA:
 * no existe forma de construir un identificador cross-day a partir de esta
 * columna. Sirve para una sola cosa: deduplicar visitas dentro de una misma
 * jornada.
 *
 * QUE NO ES — importa decirlo con precision:
 *   * No es anonimizacion. Un pseudonimo derivado de IP+UA sigue siendo un
 *     dato personal bajo la mayoria de los marcos de privacidad.
 *   * No es irreversible en sentido absoluto. Quien tenga la sal puede
 *     confirmar por fuerza bruta si una IP dada produjo un hash dado dentro
 *     de ese dia: el espacio de IPs es chico. La sal SECRETA y la rotacion
 *     diaria acotan el riesgo; no lo eliminan.
 *
 * De ahi que la sal sea obligatoria: sin EVENTS_HASH_SALT devuelve null. Es
 * preferible perder la deduplicacion antes que emitir un pseudonimo con sal
 * predecible, que si seria trivialmente reversible.
 *
 * Consecuencia para el tablero: `visit_hash` puede venir NULL. En ese caso
 * NO se reportan "visitantes unicos" — se reporta "sin datos".
 */
export function visitHash(
  ip: string,
  userAgent: string | null,
  salt: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!salt) return null;
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return createHash("sha256")
    .update(`${ip}|${userAgent ?? ""}|${salt}|${day}`)
    .digest("hex")
    .slice(0, 16);
}

// ============================================================
// Validacion principal
// ============================================================

export interface RawEventInput {
  /** Body del request (no confiable). */
  body: Record<string, unknown>;
  /** Header Referer del request (no confiable, pero no manipulable por JS). */
  referer?: string | null;
}

/**
 * Valida un evento entrante contra las allowlists.
 *
 * Descarta por completo cualquier clave no reconocida del body: la fila
 * insertada se construye campo por campo, nunca por spread del body.
 */
export function validateEvent({ body, referer }: RawEventInput): EventValidation {
  const type = body.type ?? body.event_type;
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) {
    return { valid: false, reason: "tipo-desconocido" };
  }
  const eventType = type as EventType;

  const path = normalizePath(body.path);
  if (path === null) return { valid: false, reason: "path-invalido" };
  if (isAdminPath(path)) return { valid: false, reason: "path-admin" };

  // ---- Superficie: obligatoria en wa_click, prohibida en pageview.
  let source: EventSource | null = null;
  const rawSource = body.source;
  if (eventType === "wa_click") {
    if (typeof rawSource !== "string") return { valid: false, reason: "source-faltante" };
    if (!(WA_SOURCES as readonly string[]).includes(rawSource)) {
      return { valid: false, reason: "source-invalida" };
    }
    source = rawSource as EventSource;
  } else if (rawSource !== undefined && rawSource !== null) {
    return { valid: false, reason: "source-en-pageview" };
  }

  return {
    valid: true,
    event: {
      event_type: eventType,
      path,
      property_slug: cleanPropertySlug(body.propertySlug ?? body.property_slug),
      source,
      // Derivado del header, NO del body: el cliente no elige su procedencia.
      referrer_host: referrerHost(referer),
      utm_source: cleanText(body.utmSource ?? body.utm_source, MAX.utmSource),
      utm_medium: cleanText(body.utmMedium ?? body.utm_medium, MAX.utmMedium),
      utm_campaign: cleanText(body.utmCampaign ?? body.utm_campaign, MAX.utmCampaign),
    },
  };
}
