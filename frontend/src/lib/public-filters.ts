/**
 * S26-MAP-01 — parseo de filtros publicos. Modulo PURO.
 *
 * Extraido de `app/propiedades/page.tsx` sin cambiarle la semantica:
 * ahora `/propiedades` y `/mapa` leen la MISMA URL con el MISMO parser.
 * Dos parsers distintos para la misma query string es como terminan las
 * dos vistas mostrando conjuntos distintos y nadie sabe cual miente.
 *
 * Allowlist estricta: lo que no esta en la lista se ignora (undefined),
 * nunca se pasa crudo a la consulta.
 */

import type { PropertyOperation, PropertyType } from "@/services/mock-properties";

export const VALID_OPERATIONS: readonly PropertyOperation[] = [
  "venta",
  "alquiler",
  "alquiler-temporal",
];

export const VALID_TYPES: readonly PropertyType[] = [
  "casa",
  "departamento",
  "ph",
  "terreno",
  "local",
  "oficina",
  "campo",
  "country",
];

/** Vista del listado publico. Cualquier valor raro cae en "lista". */
export type PublicVista = "lista" | "mapa";

export interface PublicFilters {
  operationType?: PropertyOperation;
  propertyType?: PropertyType;
  city?: string;
}

export function parseOperation(v: unknown): PropertyOperation | undefined {
  if (typeof v === "string" && (VALID_OPERATIONS as readonly string[]).includes(v)) {
    return v as PropertyOperation;
  }
  return undefined;
}

export function parsePropertyType(v: unknown): PropertyType | undefined {
  if (typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v)) {
    return v as PropertyType;
  }
  return undefined;
}

export function parseCity(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return v.trim().slice(0, 100);
  return undefined;
}

export function parseVista(v: unknown): PublicVista {
  return v === "mapa" ? "mapa" : "lista";
}

export function parsePublicFilters(
  params: Record<string, string | string[] | undefined>,
): PublicFilters {
  return {
    operationType: parseOperation(params.operationType),
    propertyType: parsePropertyType(params.propertyType),
    city: parseCity(params.city),
  };
}

export function hasAnyFilter(f: PublicFilters): boolean {
  return Boolean(f.operationType ?? f.propertyType ?? f.city);
}
