"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { track } from "@vercel/analytics";

/**
 * Analítica F1 — enlace de WhatsApp instrumentado.
 *
 * Único punto de emisión del evento `wa_click` (Vercel Web Analytics).
 * Sin cookies ni PII: solo la fuente del click y, si aplica, el slug de
 * la propiedad. Estos eventos son además el primer data-log de demanda
 * para el futuro VRE (qué propiedades generan intención de contacto).
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
        track("wa_click", {
          source,
          ...(propertySlug ? { property: propertySlug } : {}),
        });
      }}
    >
      {children}
    </a>
  );
}
