/**
 * S26-MAP-01 — tipos del mapa estrategico. Modulo PURO.
 *
 * INVARIANTE DE PRIVACIDAD (CORE-GEO-01, I1): las coordenadas que
 * viajan en estos tipos provienen EXCLUSIVAMENTE de las columnas
 * `public_*`. La ubicacion interna (`properties.lat` / `lng`) no tiene
 * lugar acá ni lo va a tener: si alguien necesita el domicilio exacto,
 * lo busca en el admin, no en un tipo que termina serializado al
 * navegador.
 */

import type { PublicLocation } from "@/lib/geo/types";
import type { Property, PropertyOperation, PropertyType } from "@/services/mock-properties";

/**
 * Ubicacion publicable de un punto del mapa.
 *
 * El `Exclude` no es cosmetico: hace que el COMPILADOR, y no la memoria
 * del programador, garantice que una propiedad oculta jamas llega al
 * mapa (I2, fail-closed).
 */
export type MapPublicLocation = Exclude<PublicLocation, { kind: "hidden" }>;

/** Datos minimos que la tarjeta resumen necesita mostrar. */
export interface MapPropertyBase {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: Property["currency"];
  perMonth?: boolean;
  operation: PropertyOperation;
  type: PropertyType;
  /** URL de portada ya resuelta, o null si la propiedad no tiene foto. */
  image: string | null;
  city: string;
  neighborhood?: string;
  bedrooms?: number;
  bathrooms?: number;
  coveredArea?: number;
  badges?: string[];
  /** Agencia dueña de la publicacion: define a que WhatsApp va la consulta. */
  agencyId?: string;
}

/**
 * Propiedad dibujable. `latitude`/`longitude` son el punto PUBLICO donde
 * se ancla el pin: el punto exacto publicado, o el centro del circulo
 * aproximado. Se aplanan (ademas de vivir en `location`) para que el
 * agrupador por grilla las consuma sin conocer el dominio inmobiliario.
 */
export interface MapPoint extends MapPropertyBase {
  location: MapPublicLocation;
  latitude: number;
  longitude: number;
}

/** Encuadre del mapa. */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Agencias presentes en las listas dadas. Sirve para mandar al cliente
 * SOLO las insignias/WhatsApp de las agencias que tienen algo publicado
 * (minimizacion de datos; control cruzado, B1).
 */
export function agencyIdsIn(...lists: ReadonlyArray<readonly { agencyId?: string }[]>): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) for (const it of list) if (it.agencyId) ids.add(it.agencyId);
  return ids;
}

/** Subconjunto de un mapa por agencia, restringido a las agencias presentes. */
export function pickAgencies<T>(map: Record<string, T>, ids: ReadonlySet<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) if (id in map) out[id] = map[id];
  return out;
}

/**
 * Encuadre que cubre todos los puntos. null con lista vacia: quien
 * renderiza decide el fallback (no se hardcodea un centro acá).
 */
export function boundsOf(points: readonly MapPoint[]): MapBounds | null {
  const valid = points.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  );
  if (valid.length === 0) return null;
  let south = valid[0].latitude;
  let north = valid[0].latitude;
  let west = valid[0].longitude;
  let east = valid[0].longitude;
  for (const p of valid) {
    if (p.latitude < south) south = p.latitude;
    if (p.latitude > north) north = p.latitude;
    if (p.longitude < west) west = p.longitude;
    if (p.longitude > east) east = p.longitude;
  }
  return { south, west, north, east };
}
