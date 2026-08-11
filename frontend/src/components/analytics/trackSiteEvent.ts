"use client";

import {
  ATTRIBUTION_KEY,
  externalReferrerHost,
  parseUtms,
  resolveAttribution,
  sanitizeAttribution,
  type Attribution,
} from "@/lib/attribution";
import type { EventType, EventSource } from "@/lib/events";

/**
 * VALTERRA DATA & ANALYTICS — ÚNICO emisor cliente de `site_events` (S20-PR2).
 *
 * Todo lo que manda un evento al log propio pasa por acá: el tracker de
 * pageviews y `WaLink`. Un segundo camino significaría dos formas del
 * payload, dos criterios de atribución y dos maneras de fallar.
 *
 * TRES INVARIANTES:
 *
 * 1. FAIL-SILENT, SIEMPRE. La analítica no puede romper la UI ni frenar una
 *    navegación. Si `sessionStorage` está bloqueado (modo privado, cookies
 *    de terceros deshabilitadas), si `fetch` falla, si no hay red: se
 *    descarta el evento y la persona no se entera. Nunca un throw, nunca un
 *    error visible.
 *
 * 2. NO SE ESPERA LA RESPUESTA. El click de WhatsApp navega a wa.me de
 *    inmediato. Se usa `keepalive: true` para que el request sobreviva a la
 *    descarga de la página; sin eso el navegador cancelaría el POST al
 *    navegar y perderíamos justo el evento comercial que más importa.
 *
 * 3. PAYLOAD MÍNIMO Y EXPLÍCITO. Se construye campo por campo. Nada de IP,
 *    user-agent, cookies, nombre, email, teléfono, URL completa ni query
 *    completa. El `path` va sin query string; las UTM viajan en sus propios
 *    campos.
 */

/** Forma exacta de lo que se manda. Sin campos libres. */
interface SiteEventPayload {
  type: EventType;
  path: string;
  source?: EventSource;
  propertySlug?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** Ruta pública actual, sin query ni fragmento. */
function currentPath(): string {
  const p = window.location.pathname || "/";
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/**
 * Atribución vigente de la sesión.
 *
 * Se recalcula en cada llamada porque una navegación puede traer una UTM
 * nueva. El resultado se persiste en `sessionStorage` — nunca
 * `localStorage`, nunca cookies: la atribución debe morir con la pestaña y
 * no puede convertirse en un identificador cross-session.
 */
export function currentAttribution(): Attribution {
  let stored: Attribution | null = null;
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (raw) stored = sanitizeAttribution(JSON.parse(raw));
  } catch {
    // sessionStorage inaccesible o JSON corrupto: se sigue sin atribución
    // previa. Preferimos perder atribución antes que romper la página.
    stored = null;
  }

  const entry = {
    referrerHost: externalReferrerHost(document.referrer, window.location.hostname),
    utms: parseUtms(window.location.search),
  };

  const attribution = resolveAttribution(stored, entry);

  try {
    // Se serializan SOLO los cuatro campos, campo por campo: si algo
    // contaminó el objeto en memoria, no llega al storage.
    window.sessionStorage.setItem(
      ATTRIBUTION_KEY,
      JSON.stringify({
        referrer_host: attribution.referrer_host,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
      }),
    );
  } catch {
    // Sin persistencia la cadena de atribución se pierde entre páginas,
    // pero el evento actual igual se emite.
  }

  return attribution;
}

/**
 * Emite un evento al log propio. Nunca lanza, nunca bloquea.
 *
 * NO reemplaza a Vercel Analytics: en `WaLink` los dos conviven (dual-emit).
 */
export function trackSiteEvent(
  type: EventType,
  options: { source?: EventSource; propertySlug?: string } = {},
): void {
  try {
    if (typeof window === "undefined") return;

    const attribution = currentAttribution();

    const payload: SiteEventPayload = {
      type,
      path: currentPath(),
      ...(options.source ? { source: options.source } : {}),
      ...(options.propertySlug ? { propertySlug: options.propertySlug } : {}),
      ...(attribution.referrer_host ? { referrerHost: attribution.referrer_host } : {}),
      ...(attribution.utm_source ? { utmSource: attribution.utm_source } : {}),
      ...(attribution.utm_medium ? { utmMedium: attribution.utm_medium } : {}),
      ...(attribution.utm_campaign ? { utmCampaign: attribution.utm_campaign } : {}),
    };

    // keepalive: el request sobrevive a la navegación a wa.me.
    // El `.catch` vacío es deliberado: una promesa rechazada sin manejar
    // ensuciaría la consola de la persona por un fallo de telemetría.
    void fetch("/api/events", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // Cualquier cosa inesperada muere acá. La UI no se entera.
  }
}
