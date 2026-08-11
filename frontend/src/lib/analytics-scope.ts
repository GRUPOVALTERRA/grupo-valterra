import "server-only";
import { getAdminContext, type AdminContext } from "@/lib/admin-context";
import type { AnalyticsScope } from "@/services/site-events";

/**
 * VALTERRA DATA & ANALYTICS — autorización del ámbito del tablero (S20-PR3).
 *
 * ÚNICO lugar donde se decide qué datos puede ver quien está mirando.
 *
 * LA REGLA: el parámetro de la URL es una PREFERENCIA, no un permiso. Solo
 * un super-admin puede convertir `?ambito=todas` en un ámbito global; para
 * un miembro común el parámetro se ignora por completo y queda restringido
 * a su agencia. Si esta decisión se tomara leyendo la query string, cualquiera
 * vería las métricas de las otras inmobiliarias cambiando la URL.
 *
 * Mismo patrón que el listado de propiedades de S19, deliberadamente: una
 * segunda forma de resolver ámbito sería una segunda forma de equivocarse.
 */

export interface ResolvedAnalyticsScope {
  scope: AnalyticsScope;
  ctx: AdminContext;
  /** true solo si el pedido de ámbito global fue efectivamente concedido. */
  isGlobal: boolean;
  /** Etiqueta para el encabezado. */
  label: string;
  /** true si el usuario puede alternar entre su agencia y el ecosistema. */
  canSwitchScope: boolean;
}

/**
 * Resuelve el ámbito a partir del contexto admin y, solo entonces, del
 * parámetro pedido.
 *
 * Devuelve `null` cuando no hay contexto utilizable: sin sesión válida o sin
 * agencia resoluble no se consulta nada. El middleware ya redirige antes de
 * llegar acá; esto es la red de seguridad.
 */
export async function resolveAnalyticsScope(
  ambitoParam: string | undefined,
): Promise<ResolvedAnalyticsScope | null> {
  const ctx = await getAdminContext();

  // Sin usuario ni token no hay tablero.
  if (!ctx.isSuperAdmin && !ctx.userId) return null;

  const quiereTodas = ambitoParam === "todas";
  const isGlobal = ctx.isSuperAdmin && quiereTodas;

  if (isGlobal) {
    return {
      scope: { mode: "all", agencyId: null },
      ctx,
      isGlobal: true,
      label: "Todas las inmobiliarias",
      canSwitchScope: true,
    };
  }

  // Miembro común (o super-admin sin pedir el global): su agencia.
  if (!ctx.scopedAgencyId) return null;

  return {
    scope: { mode: "agency", agencyId: ctx.scopedAgencyId },
    ctx,
    isGlobal: false,
    label: ctx.scopedAgencyName ?? "Mi inmobiliaria",
    canSwitchScope: ctx.isSuperAdmin,
  };
}
