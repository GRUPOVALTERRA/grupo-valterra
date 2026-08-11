"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { track } from "@vercel/analytics";
import { trackSiteEvent } from "@/components/analytics/trackSiteEvent";

/**
 * Analítica F1 + F2 — enlace de WhatsApp instrumentado.
 *
 * Único punto de emisión del evento `wa_click`. Sin cookies ni PII: solo la
 * fuente del click y, si aplica, el slug de la propiedad. Estos eventos son
 * además el primer data-log de demanda para el futuro VRE (qué propiedades
 * generan intención de contacto).
 *
 * DUAL EMIT (S20-PR2). El click se registra por DOS canales:
 *
 *   1. `track("wa_click")` → Vercel Web Analytics. Se CONSERVA. En plan
 *      Hobby no se puede leer ni segmentar, pero es la señal de respaldo y
 *      no cuesta nada mantenerla.
 *   2. `trackSiteEvent("wa_click")` → `site_events` en Supabase. Este es el
 *      que alimenta el tablero: datos propios, segmentables, con atribución
 *      de campaña.
 *
 * Ninguno de los dos bloquea la navegación a wa.me: los dos son fire-and-
 * forget y `trackSiteEvent` usa `keepalive` para sobrevivir a la descarga
 * de la página. Si la analítica falla, el link funciona igual — esa es la
 * prioridad, siempre.
 *
 * Usar SIEMPRE este componente para links wa.me públicos; nunca un <a>
 * suelto, así el tablero no pierde clicks.
 */

export type WaSource =
  | "card-listado"
  | "card-home"
  | "ficha"
  | "cta-home"
  | "footer"
  | "footer-contacto";

interface WaLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** Desde qué superficie se hizo el click. */
  source: WaSource;
  /** Slug de la propiedad consultada, si el click es sobre una. */
  propertySlug?: string;
  children: ReactNode;
}

export function WaLink({ href, source, propertySlug, children, ...rest }: WaLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
      onClick={() => {
        // Canal 1 — Vercel Web Analytics (F1, se conserva).
        track("wa_click", {
          source,
          ...(propertySlug ? { property: propertySlug } : {}),
        });
        // Canal 2 — log propio en Supabase (F2). Fail-silent por dentro.
        trackSiteEvent("wa_click", { source, propertySlug });
      }}
    >
      {children}
    </a>
  );
}
