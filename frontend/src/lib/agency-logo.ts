/**
 * S26-MAP-02 — reglas del logo miniatura de agencia. Modulo PURO.
 *
 * El logo se dibuja dentro del pin del mapa (un circulo de ~22 px) y en
 * la tarjeta resumen. Por eso las reglas son mas estrictas que las de
 * las fotos de propiedades: chico, casi cuadrado y liviano. La
 * validacion de CONTENIDO (magic bytes, estructura, dimensiones) sigue
 * pasando por `inspectImageBytes`, unico punto de entrada; estas reglas
 * se aplican DESPUES y solo pueden endurecer, nunca aflojar.
 *
 * SVG queda fuera a proposito: un SVG puede llevar script y va a parar
 * a un innerHTML publico. El navegador del admin lo rasteriza a PNG
 * antes de subirlo (AgencyLogoUploader), asi que el owner igual puede
 * partir de su SVG.
 */

import type { AgencyRole } from "@/services/agencies";
import type { ImageDimensions } from "@/lib/image-type";

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MIN_SIDE_PX = 200; // espejo de MIN_IMAGE_DIMENSION
export const LOGO_MAX_SIDE_PX = 512;
/** Lado al que el navegador del admin lleva la miniatura antes de subir. */
export const LOGO_TARGET_SIDE_PX = 256;
/** Tolerancia de aspecto: se dibuja en circulo, tiene que ser casi cuadrado. */
export const LOGO_ASPECT_MIN = 0.8;
export const LOGO_ASPECT_MAX = 1.25;

export type LogoRejection =
  | "too-heavy"
  | "too-small"
  | "too-big"
  | "not-square";

export function checkLogoBytes(length: number): LogoRejection | null {
  return length > LOGO_MAX_BYTES ? "too-heavy" : null;
}

export function checkLogoDimensions(dims: ImageDimensions): LogoRejection | null {
  if (dims.width < LOGO_MIN_SIDE_PX || dims.height < LOGO_MIN_SIDE_PX) return "too-small";
  if (dims.width > LOGO_MAX_SIDE_PX || dims.height > LOGO_MAX_SIDE_PX) return "too-big";
  const aspect = dims.width / dims.height;
  if (aspect < LOGO_ASPECT_MIN || aspect > LOGO_ASPECT_MAX) return "not-square";
  return null;
}

/** Quien puede cambiar el logo: mismo criterio que la configuracion de agencia. */
export function canManageAgencyLogo(role: AgencyRole | string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

const UUID_RX = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LOGO_PATH_RX = new RegExp(`^agency/${UUID_RX}/logo/${UUID_RX}\\.(png|jpg|webp)$`);

/**
 * Path dentro del bucket `properties`, bajo el prefijo de la agencia (el
 * mismo que exige el CHECK de property_images: `agency/%`). Nombre
 * aleatorio: nunca el nombre original del archivo.
 */
export function agencyLogoStoragePath(agencyId: string, randomName: string, ext: string): string {
  return `agency/${agencyId}/logo/${randomName}.${ext}`;
}

/**
 * Solo un path con ESTA forma se resuelve a URL publica. Cualquier otro
 * valor en `agencies.logo_url` (una URL externa, un path raro) se trata
 * como "sin logo": el mapa nunca dibuja una imagen de un origen que no
 * controlamos, y la CSP (`img-src`) tampoco la dejaria cargar.
 */
export function isAgencyLogoPath(value: string | null | undefined): value is string {
  return typeof value === "string" && LOGO_PATH_RX.test(value);
}
