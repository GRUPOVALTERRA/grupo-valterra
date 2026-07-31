import {
  PROPERTY_STATUSES,
  effectiveStatus,
  type PropertyStatus,
} from "./property-status";

/**
 * Filtro de estado del listado administrativo — Sprint 15-B.
 *
 * El panel es una herramienta de trabajo: por defecto muestra lo que está en
 * curso —borradores, publicadas y despublicadas— y deja las archivadas fuera.
 * Archivar es la forma de sacar una ficha del listado operativo sin borrarla
 * (no hay borrado físico), así que una archivada que sigue apareciendo vacía
 * de sentido la acción.
 *
 * Ver archivadas es entonces algo que se pide explícitamente: "Archivadas" o
 * "Todas". Nunca es lo que pasa por omisión ni lo que pasa cuando el parámetro
 * de la URL viene roto.
 */

/** Estados que el panel considera trabajo en curso. `archived` no es uno. */
export const ACTIVE_STATUSES: readonly PropertyStatus[] = [
  "draft",
  "published",
  "unpublished",
];

/** Valores admitidos en `?estado=`. */
export const ADMIN_STATUS_FILTERS = ["active", ...PROPERTY_STATUSES, "all"] as const;
export type AdminStatusFilter = (typeof ADMIN_STATUS_FILTERS)[number];

/** Lo que se aplica sin `?estado=`, y también ante un valor que no entendemos. */
export const DEFAULT_STATUS_FILTER: AdminStatusFilter = "active";

export const ADMIN_STATUS_FILTER_LABEL: Record<AdminStatusFilter, string> = {
  active: "Activas",
  draft: "Borradores",
  published: "Publicadas",
  unpublished: "Despublicadas",
  archived: "Archivadas",
  all: "Todas",
};

/**
 * Interpreta `?estado=`.
 *
 * Un valor desconocido, manipulado o repetido cae en "Activas": el default
 * seguro es el que menos muestra, no el que muestra todo. Un filtro que no se
 * entiende nunca puede destapar archivadas ni devolver el listado completo.
 */
export function parseAdminStatusFilter(raw: unknown): AdminStatusFilter {
  if (typeof raw !== "string") return DEFAULT_STATUS_FILTER;
  return (ADMIN_STATUS_FILTERS as readonly string[]).includes(raw)
    ? (raw as AdminStatusFilter)
    : DEFAULT_STATUS_FILTER;
}

/**
 * Estados que la consulta debe pedir. `undefined` significa "sin restricción"
 * y sólo lo devuelve "Todas", que es una elección explícita del operador.
 */
export function statusesForFilter(
  filter: AdminStatusFilter,
): readonly PropertyStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "active") return ACTIVE_STATUSES;
  return [filter];
}

/**
 * ¿Esta fila entra en el listado con este filtro? Misma decisión que toma la
 * consulta, disponible para verificarla sin base de por medio.
 */
export function isVisibleUnderFilter(
  row: { status?: PropertyStatus | null; published?: boolean | null },
  filter: AdminStatusFilter,
): boolean {
  const statuses = statusesForFilter(filter);
  return !statuses || statuses.includes(effectiveStatus(row));
}
