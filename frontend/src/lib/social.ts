/**
 * Redes sociales oficiales de Grupo Valterra.
 * ÚNICO lugar donde se editan las URLs — Footer y ContactSection leen de acá.
 *
 * ⚠️ TikTok: el username cambia @grupovalterra_ok → @grupovalterraar
 * alrededor del 01/09/2026. Cuando ocurra, actualizar SOLO la URL de abajo.
 */
export const SOCIAL_LINKS = [
  { name: "Facebook", href: "https://www.facebook.com/61567845351489" },
  { name: "Instagram", href: "https://www.instagram.com/grupovalterraar" },
  { name: "TikTok", href: "https://www.tiktok.com/@grupovalterra_ok" },
  { name: "X", href: "https://x.com/grupovalterraar" },
] as const;

export type SocialName = (typeof SOCIAL_LINKS)[number]["name"];
