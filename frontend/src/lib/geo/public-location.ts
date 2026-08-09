/**
 * CORE-GEO-01 — resolucion de ubicacion publicable (S18 PR1).
 *
 * REGLA DE ORO (invariante de privacidad):
 *   Esta funcion SOLO acepta los campos public_* de la fila. La
 *   ubicacion interna exacta (properties.lat/lng) NO tiene parametro
 *   de entrada aqui, a proposito: el compilador impide que la capa
 *   publica la toque. Nunca agregar lat/lng a esta interfaz.
 *
 *   Tampoco se genera "aproximacion" por offset derivado del id u otro
 *   dato de la fila: es reversible y por lo tanto inseguro. El centro
 *   aproximado se carga deliberadamente en public_latitude/longitude.
 *
 * Semantica fail-closed:
 *   - modo invalido o desconocido        => hidden
 *   - hidden                             => hidden
 *   - exact/approximate sin centro valido => hidden
 *     ("ubicacion aun no cargada" es un estado legitimo: la migracion
 *      0013 no exige centro para el modo por defecto).
 *   - approximate con radio fuera de rango => radio clampeado.
 */

import {
  PUBLIC_RADIUS_DEFAULT_M,
  type GeoPoint,
  type PublicLocation,
} from "./types";
import {
  clampRadiusM,
  isPublicLocationMode,
  isValidGeoPoint,
  toFiniteNumberOrNull,
} from "./validate";

/** Subconjunto public_* de la fila (snake_case, como llega de la base). */
export interface PublicGeoFields {
  public_location_mode: string | null | undefined;
  public_latitude: number | string | null | undefined;
  public_longitude: number | string | null | undefined;
  public_radius_m: number | string | null | undefined;
}

const HIDDEN: PublicLocation = { kind: "hidden" };

export function resolvePublicLocation(fields: PublicGeoFields): PublicLocation {
  const mode = fields.public_location_mode;
  if (!isPublicLocationMode(mode) || mode === "hidden") return HIDDEN;

  const point: GeoPoint = {
    latitude: toFiniteNumberOrNull(fields.public_latitude) as number,
    longitude: toFiniteNumberOrNull(fields.public_longitude) as number,
  };
  if (!isValidGeoPoint(point)) return HIDDEN;

  if (mode === "exact") return { kind: "exact", point };

  const radius = toFiniteNumberOrNull(fields.public_radius_m);
  return {
    kind: "approximate",
    center: point,
    radiusM: clampRadiusM(radius ?? PUBLIC_RADIUS_DEFAULT_M),
  };
}

// Nota: CORE-GEO-01 es provider-neutral. Links o renderers de mapas
// (OSM, Google, etc.) pertenecen a la capa de UI del producto (S18-PR3),
// nunca a este modulo.
