/**
 * CORE-GEO-01 — validadores puros (S18 PR1).
 * Sin dependencias; espejan los CHECKs de la migracion 0013.
 */

import {
  PUBLIC_RADIUS_MAX_M,
  PUBLIC_RADIUS_MIN_M,
  type GeoPoint,
  type PublicLocationMode,
} from "./types";

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return isValidLatitude(p.latitude) && isValidLongitude(p.longitude);
}

const MODES: readonly PublicLocationMode[] = ["exact", "approximate", "hidden"];

export function isPublicLocationMode(value: unknown): value is PublicLocationMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export function isValidRadiusM(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PUBLIC_RADIUS_MIN_M &&
    value <= PUBLIC_RADIUS_MAX_M
  );
}

/** Lleva cualquier numero al rango permitido de radio publico. */
export function clampRadiusM(value: number): number {
  if (!Number.isFinite(value)) return PUBLIC_RADIUS_MIN_M;
  const int = Math.round(value);
  if (int < PUBLIC_RADIUS_MIN_M) return PUBLIC_RADIUS_MIN_M;
  if (int > PUBLIC_RADIUS_MAX_M) return PUBLIC_RADIUS_MAX_M;
  return int;
}

/**
 * Supabase devuelve columnas numeric como string. Convierte de forma
 * estricta; cualquier cosa no interpretable => null (fail-closed).
 */
export function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
