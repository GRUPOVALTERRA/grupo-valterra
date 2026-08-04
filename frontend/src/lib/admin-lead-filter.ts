import {
  LEAD_NOTIFY_STATUSES,
  type Lead,
  type LeadNotifyStatus,
  type LeadStatus,
} from "@/services/mock-leads";

/**
 * Filtros de la bandeja de leads — Sprint 16, PR2.
 *
 * Hasta este PR el buscador y el selector de estado eran decorativos: el
 * componente guardaba el valor en estado local y llamaba a un `onChange` que
 * nadie pasaba, así que escribir en el buscador no filtraba nada. Acá se
 * resuelve igual que en el listado de propiedades (S15-B): el filtro vive en
 * la URL y se aplica del lado del servidor, para que la vista sea compartible,
 * sobreviva a un refresh y no dependa de estado que se pierde.
 *
 * Todo lo de este archivo es PURO: sin red, sin base, sin React. Es la misma
 * decisión que toma la página, disponible para verificarla sin levantar nada.
 */

/* ============================================================
 * Filtro por estado del aviso  (?aviso=)
 * ============================================================ */

/** Valores admitidos en `?aviso=`. */
export const NOTIFY_FILTERS = [
  "all",
  "attention",
  ...LEAD_NOTIFY_STATUSES,
] as const;
export type NotifyFilter = (typeof NOTIFY_FILTERS)[number];

export const DEFAULT_NOTIFY_FILTER: NotifyFilter = "all";

/**
 * Estados que reclaman una acción del operador.
 *
 * `unknown` NO está acá, y es la decisión central de este PR. Los leads
 * anteriores a la migración quedaron en `unknown` porque no existe evidencia
 * de si el correo salió; meterlos en "Requieren atención" convertiría nueve
 * consultas históricas en una cola de problemas inventada, y empujaría a
 * "arreglar" algo que quizás ya se atendió por teléfono hace semanas.
 */
export const ATTENTION_STATUSES: readonly LeadNotifyStatus[] = [
  "pending",
  "failed",
  "skipped",
];

export const NOTIFY_FILTER_LABEL: Record<NotifyFilter, string> = {
  all: "Todos",
  attention: "Requieren atención",
  sent: "Avisados",
  pending: "Pendientes de aviso",
  failed: "Con aviso fallido",
  skipped: "No enviados",
  unknown: "Históricos",
};

/**
 * Interpreta `?aviso=`. Un valor desconocido o manipulado cae en "Todos":
 * ante un filtro que no se entiende, mostrar de más es preferible a esconder
 * leads sin que el operador se entere.
 */
export function parseNotifyFilter(raw: unknown): NotifyFilter {
  if (typeof raw !== "string") return DEFAULT_NOTIFY_FILTER;
  return (NOTIFY_FILTERS as readonly string[]).includes(raw)
    ? (raw as NotifyFilter)
    : DEFAULT_NOTIFY_FILTER;
}

/** ¿Este lead entra en el listado con este filtro de aviso? */
export function matchesNotifyFilter(
  status: LeadNotifyStatus,
  filter: NotifyFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return ATTENTION_STATUSES.includes(status);
  return status === filter;
}

/** Cuántos leads reclaman atención. Se calcula sobre el scope, no sobre la vista filtrada. */
export function countAttention(leads: readonly Lead[]): number {
  return leads.filter((l) => ATTENTION_STATUSES.includes(l.notifyStatus)).length;
}

/* ============================================================
 * Filtro por estado del lead  (?estado=)
 * ============================================================ */

export const DEFAULT_LEAD_STATUS_FILTER = "all" as const;
export type LeadStatusFilter = LeadStatus | typeof DEFAULT_LEAD_STATUS_FILTER;

const LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "converted",
  "lost",
  "archived",
];

export const LEAD_STATUS_FILTER_LABEL: Record<LeadStatusFilter, string> = {
  all: "Todos los estados",
  new: "Nuevos",
  contacted: "Contactados",
  qualified: "Calificados",
  scheduled: "Visitas agendadas",
  converted: "Convertidos",
  lost: "Perdidos",
  archived: "Archivados",
};

export function parseLeadStatusFilter(raw: unknown): LeadStatusFilter {
  if (typeof raw !== "string") return DEFAULT_LEAD_STATUS_FILTER;
  return (LEAD_STATUSES as readonly string[]).includes(raw)
    ? (raw as LeadStatus)
    : DEFAULT_LEAD_STATUS_FILTER;
}

/* ============================================================
 * Búsqueda  (?q=)
 * ============================================================ */

/** Tope defensivo: una búsqueda desmedida no debe recorrer texto sin límite. */
const MAX_SEARCH_LENGTH = 80;

/** Normaliza el término: recorta, colapsa espacios, acota y saca acentos. */
export function parseLeadSearch(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
}

/** Marcas diacríticas combinantes que deja `normalize("NFD")` (U+0300–U+036F). */
const COMBINING_MARKS = /[̀-ͯ]/g;

function fold(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/**
 * Campos donde busca la bandeja. El mensaje del lead queda FUERA a propósito:
 * es texto libre y largo, y buscar dentro devolvería coincidencias que el
 * operador no puede prever mirando la tabla.
 */
export function leadMatchesSearch(lead: Lead, term: string): boolean {
  if (!term) return true;
  const needle = fold(term);
  return [lead.name, lead.email, lead.phone, lead.propertyTitle]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .some((v) => fold(v).includes(needle));
}

/* ============================================================
 * Aplicación conjunta
 * ============================================================ */

export interface LeadListFilters {
  q: string;
  estado: LeadStatusFilter;
  aviso: NotifyFilter;
}

export function parseLeadListFilters(params: {
  q?: unknown;
  estado?: unknown;
  aviso?: unknown;
}): LeadListFilters {
  return {
    q: parseLeadSearch(params.q),
    estado: parseLeadStatusFilter(params.estado),
    aviso: parseNotifyFilter(params.aviso),
  };
}

/**
 * Aplica los tres filtros. Se combinan con AND: acotar por estado del lead no
 * borra la búsqueda ni el filtro de aviso, y viceversa.
 *
 * El filtrado ocurre en memoria sobre el conjunto que el servicio ya devolvió
 * acotado por agencia. Con el volumen actual es exacto y evita tocar la
 * consulta —y por lo tanto el scoping multi-tenant, que es lo delicado—. Si el
 * volumen crece, el punto a mover es este, no la UI.
 */
export function applyLeadFilters(
  leads: readonly Lead[],
  filters: LeadListFilters,
): Lead[] {
  return leads.filter(
    (lead) =>
      (filters.estado === "all" || lead.status === filters.estado) &&
      matchesNotifyFilter(lead.notifyStatus, filters.aviso) &&
      leadMatchesSearch(lead, filters.q),
  );
}

/** Cuántos filtros no están en su valor por defecto (para el botón "Limpiar"). */
export function activeFilterCount(filters: LeadListFilters): number {
  return [
    Boolean(filters.q),
    filters.estado !== DEFAULT_LEAD_STATUS_FILTER,
    filters.aviso !== DEFAULT_NOTIFY_FILTER,
  ].filter(Boolean).length;
}
