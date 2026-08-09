/**
 * CORE-GEO-01 — contrato de geocodificacion (S18 PR1).
 *
 * SOLO la interfaz: en PR1 no hay adaptadores. El dominio nunca se
 * acopla a un proveedor concreto; Nominatim/OSM sera UN adaptador
 * posible (PR4, y solo si demuestra valor). Antes de implementarlo,
 * verificar la politica de uso vigente del proveedor (rate limits,
 * User-Agent identificable, atribucion). Prohibido el scraping y la
 * geocodificacion masiva.
 */

import type { GeoPoint } from "./types";

export interface GeocodingQuery {
  /** Direccion libre tal como la escribio el admin. */
  address: string;
  city?: string;
  province?: string;
  /** ISO-3166 alpha-2, ej. "AR". */
  countryCode?: string;
}

export type GeocodingPrecision = "rooftop" | "street" | "locality" | "region";

export interface GeocodingResult {
  point: GeoPoint;
  precision: GeocodingPrecision;
  /** Nombre del adaptador que produjo el resultado (auditoria). */
  source: string;
  /** Etiqueta legible del lugar resuelto, si el proveedor la da. */
  displayName?: string;
}

export interface GeocodingProvider {
  readonly name: string;
  /**
   * Resuelve una direccion a coordenadas. null = sin resultado.
   * Los adaptadores deben respetar los limites del proveedor y
   * propagar errores de red como excepciones (el llamador decide).
   */
  geocode(query: GeocodingQuery): Promise<GeocodingResult | null>;
}
