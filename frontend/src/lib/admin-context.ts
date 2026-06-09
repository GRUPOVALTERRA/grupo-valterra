import { cookies } from "next/headers";
import { getCurrentUser, getCurrentMemberships, type Membership } from "@/lib/auth";
import { getValterraAgency, type AgencyLite } from "@/services/agencies";
import { log } from "@/lib/logger";

/**
 * Admin context resolver - Sprint 10 MF4.
 *
 * Determina QUIEN esta entrando al panel admin y a QUE agency esta scoped.
 *
 * Dos paths coexistentes (los mismos del middleware):
 *   1. ADMIN_TOKEN cookie match env ADMIN_TOKEN
 *      -> super-admin Valterra
 *      -> scope = Grupo Valterra (read all Valterra data)
 *
 *   2. Supabase Auth user con al menos 1 membership
 *      -> scope = primera membership (multi-agency switching: MF6+)
 *
 *   3. Sin auth valida -> null (middleware redirige antes de llegar aca)
 */

const ADMIN_COOKIE = "valterra-admin-session";

export interface AdminContext {
  isSuperAdmin: boolean;
  userId: string | null;
  userEmail: string | null;
  memberships: Membership[];
  scopedAgencyId: string | null;
  scopedAgencyName: string | null;
  scopedAgencySlug: string | null;
}

export const EMPTY_ADMIN_CONTEXT: AdminContext = {
  isSuperAdmin: false,
  userId: null,
  userEmail: null,
  memberships: [],
  scopedAgencyId: null,
  scopedAgencyName: null,
  scopedAgencySlug: null,
};

/**
 * Retorna el contexto del request actual.
 * NO throws - errores caen a EMPTY_ADMIN_CONTEXT.
 *
 * Llamar desde server components / server actions de /admin/*.
 */
export async function getAdminContext(): Promise<AdminContext> {
  // ============================================================
  // Path 1: ADMIN_TOKEN cookie (super-admin legacy)
  // ============================================================
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(ADMIN_COOKIE)?.value;

    if (tokenCookie && tokenCookie === adminToken) {
      log.warn("admin-context", "⚠ ADMIN_TOKEN legacy activo — emergency fallback en uso");
      const valterra: AgencyLite | null = await getValterraAgency();
      return {
        isSuperAdmin: true,
        userId: null,
        userEmail: null,
        memberships: [],
        scopedAgencyId: valterra?.id ?? null,
        scopedAgencyName: valterra?.name ?? "Grupo Valterra",
        scopedAgencySlug: valterra?.slug ?? "valterra",
      };
    }
  }

  // ============================================================
  // Path 2: Supabase Auth user + memberships
  // ============================================================
  const user = await getCurrentUser();
  if (user) {
    const memberships = await getCurrentMemberships();
    const first = memberships[0] ?? null;
    return {
      isSuperAdmin: false,
      userId: user.id,
      userEmail: user.email ?? null,
      memberships,
      scopedAgencyId: first?.agencyId ?? null,
      scopedAgencyName: first?.agencyName ?? null,
      scopedAgencySlug: first?.agencySlug ?? null,
    };
  }

  // ============================================================
  // Path 3: Sin auth -> EMPTY (middleware deberia haber redirigido)
  // ============================================================
  return EMPTY_ADMIN_CONTEXT;
}

/**
 * Atajo: id de la agency scoped del request actual.
 * Null = sin scope resoluble (caller decide: mostrar vacio o redirect).
 */
export async function getScopedAgencyId(): Promise<string | null> {
  const ctx = await getAdminContext();
  return ctx.scopedAgencyId;
}
