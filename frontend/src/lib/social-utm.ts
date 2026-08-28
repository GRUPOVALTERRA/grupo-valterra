/**
 * VALTERRA DATA & ANALYTICS — redes sociales (S20-PR4).
 *
 * Dos responsabilidades, ambas puras y sin dependencias:
 *
 *   1. `classifyNetwork` — espejo en TypeScript de la clasificación que
 *      hace `analytics_social` (migración 0016). La agregación real ocurre
 *      en PostgreSQL; esta copia existe para poder testear las reglas sin
 *      levantar una base y para documentarlas en un solo lugar legible.
 *      Si se cambia una regla acá, hay que cambiarla también en 0016.
 *
 *   2. `buildUtmUrl` — armado de los links etiquetados que se publican en
 *      cada red. Sin estos links el tablero de redes no tiene qué mostrar:
 *      Instagram y Facebook recortan el referrer en buena parte del
 *      tráfico móvil, así que la única atribución confiable es la que
 *      viaja declarada en la URL.
 *
 * Módulo aislado: no importa nada de auth, supabase ni next.
 */

export interface SocialNetwork {
  /** Coincide con el valor que devuelve `analytics_social.network`. */
  id: string;
  label: string;
  /** Valor que se escribe en `utm_source` al generar un link. */
  utmSource: string;
}

/** Orden de presentación en el tablero y en el generador. */
export const SOCIAL_NETWORKS: readonly SocialNetwork[] = [
  { id: "instagram", label: "Instagram", utmSource: "instagram" },
  { id: "facebook", label: "Facebook", utmSource: "facebook" },
  { id: "tiktok", label: "TikTok", utmSource: "tiktok" },
  { id: "x", label: "X", utmSource: "x" },
  { id: "youtube", label: "YouTube", utmSource: "youtube" },
  { id: "whatsapp", label: "WhatsApp", utmSource: "whatsapp" },
] as const;

/** Redes conocidas + el cajón de sastre que devuelve la RPC. */
export const OTHER_NETWORK_ID = "otros";
export const OTHER_NETWORK_LABEL = "Otros sitios";

/** Etiqueta legible de una red. Nunca devuelve el id crudo en la UI. */
export function networkLabel(id: string): string {
  const found = SOCIAL_NETWORKS.find((n) => n.id === id);
  if (found) return found.label;
  return id === OTHER_NETWORK_ID ? OTHER_NETWORK_LABEL : id;
}

/** Alias de `utm_source` que se aceptan como sinónimo de cada red. */
const SOURCE_ALIASES: Record<string, string> = {
  instagram: "instagram",
  ig: "instagram",
  facebook: "facebook",
  fb: "facebook",
  meta: "facebook",
  tiktok: "tiktok",
  tt: "tiktok",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  yt: "youtube",
  whatsapp: "whatsapp",
  wa: "whatsapp",
};

/** Hosts exactos que identifican una red. */
const HOST_EXACT: Record<string, string> = {
  "fb.me": "facebook",
  "x.com": "x",
  "twitter.com": "x",
  "t.co": "x",
  "youtu.be": "youtube",
  "wa.me": "whatsapp",
};

/** Sufijos de host. Cubren los subdominios que usan las apps móviles. */
const HOST_SUFFIX: ReadonlyArray<[string, string]> = [
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["whatsapp.com", "whatsapp"],
];

export interface ClassifyInput {
  utmSource?: string | null;
  referrerHost?: string | null;
}

/**
 * Devuelve el id de red, `"otros"`, o `null` para tráfico directo.
 *
 * `null` es significativo: el evento no vino de ninguna red y queda FUERA
 * del reporte. Contarlo como red inflaría el denominador de conversión con
 * visitas que nunca pasaron por una publicación.
 */
export function classifyNetwork({ utmSource, referrerHost }: ClassifyInput): string | null {
  // 1º la declaración explícita del link.
  const src = (utmSource ?? "").trim().toLowerCase();
  if (src) return SOURCE_ALIASES[src] ?? OTHER_NETWORK_ID;

  // 2º el host de origen, sin `www.` y en minúsculas.
  const host = (referrerHost ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!host) return null; // 4º tráfico directo.

  if (HOST_EXACT[host]) return HOST_EXACT[host];
  for (const [suffix, id] of HOST_SUFFIX) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return id;
  }

  // 3º vino de algún lado, pero no de una red conocida.
  return OTHER_NETWORK_ID;
}

// ============================================================
// Generador de links etiquetados
// ============================================================

/** Medio fijo: distingue el tráfico de redes del de mail o pauta paga. */
export const UTM_MEDIUM_SOCIAL = "social";

/**
 * Normaliza el nombre de campaña a algo apto para una URL y estable entre
 * publicaciones: minúsculas, sin acentos, separado por guiones.
 *
 * Sin esto, "Verano 2027" y "verano 2027" contarían como dos campañas
 * distintas y el reporte quedaría partido.
 */
export function normalizeCampaign(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface BuildUtmInput {
  /** Origen del sitio, sin barra final. Ej: https://www.grupovalterra.com.ar */
  baseUrl: string;
  /** Ruta interna con barra inicial. Ej: `/` o `/propiedades/mi-terreno` */
  path: string;
  /** Id de red de `SOCIAL_NETWORKS`. */
  network: string;
  /** Nombre de campaña sin normalizar. Opcional. */
  campaign?: string;
}

/**
 * Devuelve la URL lista para publicar.
 *
 * Los parámetros se agregan preservando los que la ruta ya trajera, y en
 * orden fijo (source, medium, campaign) para que el mismo link generado dos
 * veces sea idéntico carácter a carácter.
 */
export function buildUtmUrl({ baseUrl, path, network, campaign }: BuildUtmInput): string {
  const net = SOCIAL_NETWORKS.find((n) => n.id === network);
  const source = net ? net.utmSource : network.trim().toLowerCase();

  const base = baseUrl.replace(/\/+$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  const [rawPath, rawQuery = ""] = clean.split("?");

  const params = new URLSearchParams(rawQuery);
  params.set("utm_source", source);
  params.set("utm_medium", UTM_MEDIUM_SOCIAL);

  const camp = normalizeCampaign(campaign ?? "");
  if (camp) params.set("utm_campaign", camp);
  else params.delete("utm_campaign");

  return `${base}${rawPath}?${params.toString()}`;
}
