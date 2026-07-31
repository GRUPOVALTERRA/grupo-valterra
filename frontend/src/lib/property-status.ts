/**
 * Ciclo de vida de una propiedad — Sprint 15-A.
 *
 * En la base, `status` es la fuente de verdad y `published` (boolean) es un
 * espejo derivado por trigger (migración 0009). Toda la RLS pública y las
 * consultas del sitio siguen apoyándose en `published`, así que un borrador o
 * una propiedad archivada quedan fuera del sitio por el mismo camino ya
 * auditado, sin reescribir políticas.
 */

export const PROPERTY_STATUSES = ["draft", "published", "unpublished", "archived"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export function isPropertyStatus(v: unknown): v is PropertyStatus {
  return typeof v === "string" && (PROPERTY_STATUSES as readonly string[]).includes(v);
}

/** Transiciones permitidas. No existe borrado físico en este sprint. */
const TRANSITIONS: Record<PropertyStatus, readonly PropertyStatus[]> = {
  draft: ["published", "archived"],
  published: ["unpublished", "archived"],
  // Restaurar/despublicar nunca publica solo: hay que publicar explícitamente.
  unpublished: ["published", "archived"],
  archived: ["draft", "unpublished"],
};

export function canTransition(from: PropertyStatus, to: PropertyStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Estado efectivo de una fila: `status` si existe, derivado de `published` si
 * no. Las filas anteriores a la migración 0009 sólo tienen el booleano, y el
 * panel necesita ubicarlas igual en el ciclo de vida.
 */
export function effectiveStatus(row: {
  status?: PropertyStatus | null;
  published?: boolean | null;
}): PropertyStatus {
  return row.status ?? (row.published ? "published" : "draft");
}

/** Estados visibles en el sitio público. */
export function isPubliclyVisible(status: PropertyStatus): boolean {
  return status === "published";
}

export const STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  unpublished: "Despublicada",
  archived: "Archivada",
};
