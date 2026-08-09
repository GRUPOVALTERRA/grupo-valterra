/**
 * S18 PR2 — validación server-side del payload GEO del editor admin.
 * Patrón espejo de validateProperty/validateLead: puro TS, sin deps.
 *
 * Reglas (espejan 0013 + reglas duras de privacidad):
 *  - lat/lng interna: rango WGS84; AMBAS o NINGUNA (limpiar = ambas vacías).
 *  - mode: exact | approximate | hidden (allowlist estricta).
 *  - mode approximate/exact => centro público REQUERIDO (se rechaza el
 *    guardado incompleto desde admin; la base tolera "sin ubicación
 *    todavía" pero el formulario no finge haber publicado un punto).
 *  - centro público: ambas o ninguna, rango WGS84.
 *  - radius: entero 50..5000 (requerido siempre: la columna es NOT NULL).
 *  - hidden: puede conservar public_* almacenadas; el resolver ya
 *    devuelve hidden (fail-closed).
 *  - NUNCA se copia lat/lng interna a public_* aquí: esa copia solo
 *    ocurre por acción deliberada del operador en la UI.
 */

import {
  PUBLIC_RADIUS_MAX_M,
  PUBLIC_RADIUS_MIN_M,
  type GeoPoint,
  type PublicLocationMode,
} from "@/lib/geo/types";
import {
  isPublicLocationMode,
  isValidLatitude,
  isValidLongitude,
  toFiniteNumberOrNull,
} from "@/lib/geo/validate";

export interface GeoFormInput {
  lat: unknown;
  lng: unknown;
  public_location_mode: unknown;
  public_latitude: unknown;
  public_longitude: unknown;
  public_radius_m: unknown;
}

export interface GeoFormData {
  internal: GeoPoint | null;
  publicLocationMode: PublicLocationMode;
  publicPoint: GeoPoint | null;
  publicRadiusM: number;
}

export type GeoValidationResult =
  | { valid: true; data: GeoFormData }
  | { valid: false; errors: Record<string, string> };

/** "" / null / undefined => null; número inválido => NaN (error). */
function parseCoord(value: unknown): number | null | typeof NaN {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = toFiniteNumberOrNull(s.replace(",", "."));
  return n === null ? NaN : n;
}

export function validateGeo(input: GeoFormInput): GeoValidationResult {
  const errors: Record<string, string> = {};

  // ---- interna ----
  const lat = parseCoord(input.lat);
  const lng = parseCoord(input.lng);
  if (Number.isNaN(lat)) errors.lat = "Latitud inválida";
  else if (lat !== null && !isValidLatitude(lat)) errors.lat = "Latitud fuera de rango (-90 a 90)";
  if (Number.isNaN(lng)) errors.lng = "Longitud inválida";
  else if (lng !== null && !isValidLongitude(lng)) errors.lng = "Longitud fuera de rango (-180 a 180)";
  if (!errors.lat && !errors.lng && (lat === null) !== (lng === null)) {
    errors.lat = errors.lng = "Cargá ambas coordenadas o ninguna";
  }

  // ---- modo ----
  const mode = typeof input.public_location_mode === "string" ? input.public_location_mode.trim() : "";
  if (!isPublicLocationMode(mode)) {
    errors.public_location_mode = "Modo de visibilidad inválido";
  }

  // ---- centro público ----
  const plat = parseCoord(input.public_latitude);
  const plng = parseCoord(input.public_longitude);
  if (Number.isNaN(plat)) errors.public_latitude = "Latitud pública inválida";
  else if (plat !== null && !isValidLatitude(plat)) errors.public_latitude = "Latitud pública fuera de rango";
  if (Number.isNaN(plng)) errors.public_longitude = "Longitud pública inválida";
  else if (plng !== null && !isValidLongitude(plng)) errors.public_longitude = "Longitud pública fuera de rango";
  if (!errors.public_latitude && !errors.public_longitude && (plat === null) !== (plng === null)) {
    errors.public_latitude = errors.public_longitude = "Cargá ambas coordenadas públicas o ninguna";
  }

  // Guardado incompleto: modos visibles exigen centro público deliberado.
  if (
    isPublicLocationMode(mode) &&
    mode !== "hidden" &&
    !errors.public_latitude &&
    !errors.public_longitude &&
    (plat === null || plng === null)
  ) {
    errors.public_latitude = errors.public_longitude =
      mode === "exact"
        ? "El modo Exacta requiere un punto público definido a propósito"
        : "El modo Aproximada requiere un centro público definido";
  }

  // ---- radio ----
  const radiusRaw = toFiniteNumberOrNull(
    typeof input.public_radius_m === "string"
      ? input.public_radius_m.trim()
      : input.public_radius_m,
  );
  const radius = radiusRaw === null ? null : Math.round(radiusRaw);
  if (radius === null || radius < PUBLIC_RADIUS_MIN_M || radius > PUBLIC_RADIUS_MAX_M) {
    errors.public_radius_m = `Radio entre ${PUBLIC_RADIUS_MIN_M} y ${PUBLIC_RADIUS_MAX_M} m`;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      internal: lat !== null && lng !== null ? { latitude: lat as number, longitude: lng as number } : null,
      publicLocationMode: mode as PublicLocationMode,
      publicPoint:
        plat !== null && plng !== null
          ? { latitude: plat as number, longitude: plng as number }
          : null,
      publicRadiusM: radius as number,
    },
  };
}
