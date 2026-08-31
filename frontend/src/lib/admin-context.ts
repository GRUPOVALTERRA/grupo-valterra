import { getCurrentUser, getCurrentMemberships, type Membership } from "@/lib/auth";
import { getValterraAgency, type AgencyLite } from "@/services/agencies";
import { log } from "@/lib/logger";

/**
 * Admin context resolver - Sprint 10 MF4 · actualizado por SPEC-S23.
 *
 * Determina QUIEN esta entrando al panel admin y a QUE agency esta scoped.
 *
 * S23 retiro el path por cookie ADMIN_TOKEN: toda identidad sale de Supabase
 * Auth. Quedan dos paths, ambos con user identificado:
 *   1. Supabase Auth user cuyo email esta en SUPER_ADMIN_EMAILS
 *      -> super-admin Valterra
 *      -> scope = Grupo Valterra (read all Valterra data)
 *
 *   2. Supabase Auth user con al menos 1 membership
 *      -> scope = primera membership (multi-agency switching: MF6+)
 *
 *   3. Sin auth valida -> EMPTY (middleware redirige antes de llegar aca)
 */

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
  // Path 1: super-admin por SUPER_ADMIN_EMAILS / Path 2: memberships
  // ============================================================
  const user = await getCurrentUser();
  if (user) {
    // Super-admin por email (SUPER_ADMIN_EMAILS env, comma-separated)
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (user.email && superAdminEmails.includes(user.email.toLowerCase())) {
      log.info("admin-context", "super-admin via SUPER_ADMIN_EMAILS", { email: user.email });
      const valterra: AgencyLite | null = await getValterraAgency();
      return {
        isSuperAdmin: true,
        userId: user.id,
        userEmail: user.email,
        memberships: [],
        scopedAgencyId: valterra?.id ?? null,
        scopedAgencyName: valterra?.name ?? "Grupo Valterra",
        scopedAgencySlug: valterra?.slug ?? "valterra",
      };
    }

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
  // Sin auth -> EMPTY (middleware deberia haber redirigido)
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
