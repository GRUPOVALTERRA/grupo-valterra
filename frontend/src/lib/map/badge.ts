/**
 * S26-MAP-02 — insignia de agencia para el pin. Modulo PURO.
 *
 * El pin es un `L.divIcon`, o sea innerHTML. Todo lo que entra ahi se
 * trata como hostil aunque venga de nuestra propia base: la URL del
 * logo la cargo un owner, y un owner es un usuario, no un desarrollador.
 *
 * Doble defensa:
 *   1. `pinBadgeFor` descarta cualquier `src` que no sea https en un
 *      host permitido (los mismos de la CSP `img-src`) o una ruta propia.
 *   2. El que arma el HTML igual escapa el valor (ver PropertiesMap).
 *
 * Sin logo valido se muestra la inicial del nombre: el pin siempre
 * tiene insignia, con o sin imagen.
 */

export interface AgencyBadge {
  name: string;
  logoUrl: string | null;
}

export interface PinBadge {
  /** URL ya validada (nunca javascript:, data:, http: ni hosts ajenos). */
  src: string | null;
  /** Una letra mayuscula (A-Z, 0-9) o un punto medio si no hay nada util. */
  initial: string;
}

const ALLOWED_HOST_SUFFIXES = [".supabase.co", ".supabase.in"] as const;

export function isSafeLogoSrc(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (/[\s"'<>\\]/.test(value)) return false;

  // Ruta propia: "/brand/x.png" si, "//evil.com/x.png" no.
  if (value.startsWith("/")) return !value.startsWith("//");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

export function initialOf(name: string | null | undefined): string {
  const limpio = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  const m = limpio.match(/[A-Z0-9]/);
  return m ? m[0] : "·";
}

export function pinBadgeFor(badge: AgencyBadge | null | undefined): PinBadge {
  if (!badge) return { src: null, initial: "·" };
  return {
    src: isSafeLogoSrc(badge.logoUrl) ? badge.logoUrl : null,
    initial: initialOf(badge.name),
  };
}
