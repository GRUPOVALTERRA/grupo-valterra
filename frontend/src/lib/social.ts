/**
 * Redes sociales oficiales de Grupo Valterra.
 * ÚNICO lugar donde se editan las URLs — Footer y ContactSection leen de acá.
 *
 * ⚠️ TikTok: el username cambia @grupovalterra_ok → @grupovalterraar
 * alrededor del 01/09/2026. Cuando ocurra, actualizar SOLO la URL de abajo.
 */
export const SOCIAL_LINKS = [
  // Página sin username todavía — cuando reclamen @grupovalterra, reemplazar por la URL corta.
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61593004700771" },
  { name: "Instagram", href: "https://www.instagram.com/grupovalterraar" },
  { name: "TikTok", href: "https://www.tiktok.com/@grupovalterra_ok" },
  { name: "X", href: "https://x.com/grupovalterraar" },
] as const;

export type SocialName = (typeof SOCIAL_LINKS)[number]["name"];

/**
 * WhatsApp general de Grupo Valterra (dígitos wa.me).
 * Los botones de propiedades usan el WhatsApp de la agency dueña y caen
 * a este número solo si la agency no tiene uno cargado.
 */
export const DEFAULT_WHATSAPP = "5493795159096";
