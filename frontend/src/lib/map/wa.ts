/**
 * S26-MAP-01 — enlace de WhatsApp del mapa. Modulo PURO.
 *
 * Vive separado del componente a proposito: el mensaje que llega al
 * telefono de la inmobiliaria es una decision de negocio del titular,
 * no un detalle de maquetado. Acá se testea sin renderizar nada y la
 * guarda G2 lo compara contra el literal aprobado.
 *
 * MENSAJE APROBADO (13/09/2026, titular):
 *   Vi esta propiedad {TITULO} en Grupo Valterra, quisiera que me
 *   contacten. gracias
 *
 * Es deliberadamente DISTINTO del mensaje de las cards del listado:
 * es la unica señal que ve la inmobiliaria en el telefono, y permite
 * reconocer de una mirada que el interesado vino del mapa.
 */

import { DEFAULT_WHATSAPP } from "@/lib/social";

/** Texto plano (sin codificar) que se le propone al interesado. */
export function mapWhatsappMessage(title: string): string {
  return `Vi esta propiedad ${title} en Grupo Valterra, quisiera que me contacten. gracias`;
}

/**
 * Enlace wa.me a la agencia dueña de la publicacion.
 *
 * Sin WhatsApp de agencia cae al numero general de Grupo Valterra: una
 * consulta que nadie recibe es peor que una consulta mal ruteada.
 *
 * NO existe un camino que use el telefono del propietario particular:
 * decision del titular del 13/09/2026 (D1). Publicar el numero de un
 * particular en una web abierta lo expone a spam y saltea a la
 * inmobiliaria en la captacion.
 */
export function buildMapWhatsappLink(title: string, agencyWhatsapp?: string): string {
  const digits = (agencyWhatsapp ?? "").replace(/\D/g, "") || DEFAULT_WHATSAPP;
  return `https://wa.me/${digits}?text=${encodeURIComponent(mapWhatsappMessage(title))}`;
}
