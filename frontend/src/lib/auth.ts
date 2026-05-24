import { getSupabaseServer } from "@/lib/supabase-server";
import { log } from "@/lib/logger";
import type { User } from "@supabase/supabase-js";

/**
 * Auth helpers - Sprint 10 MF1 foundation.
 *
 * MF1 implementa SOLO las primitivas:
 *   - getCurrentUser(): Supabase Auth user o null
 *   - getCurrentMemberships(): array de memberships del user actual
 *
 * MF3 wirea estos helpers con login UI + middleware refresh.
 * MF4 los usa en /admin pages para scoping per agency.
 *
 * Hoy estos helpers retornan null / [] porque no hay user autenticado todavia
 * (no existe login UI Supabase). Eso es intencional y no rompe nada.
 *
 * El admin path actual via ADMIN_TOKEN sigue intacto - NO depende de estos
 * helpers. Coexistencia limpia.
 */

export type AgencyRole = "owner" | "admin" | "agent" | "viewer";

export interface Membership {
  agencyId: string;
  agencySlug: string;
  agencyName: string;
  role: AgencyRole;
}

/**
 * Retorna el Supabase Auth user actual o null si no hay session.
 * No throws - errores se loggean y caen a null.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // AuthSessionMissingError es lo esperado cuando no hay session.
      // Cualquier otro error es ruido real.
      if (error.message !== "Auth session missing!") {
        log.warn("auth", "getUser error", { message: error.message });
      }
      return null;
    }
    return data.user;
  } catch (err) {
    log.error("auth", "getCurrentUser failed", err instanceof Error ? err : { err: String(err) });
    return null;
  }
}

interface MembershipRow {
  agency_id: string;
  role: AgencyRole;
  agencies: { slug: string; name: string } | { slug: string; name: string }[] | null;
}

/**
 * Retorna las memberships del user actual.
 * - Sin user autenticado -> []
 * - Error de query -> [] + log
 * - User sin memberships -> []
 *
 * NO throws.
 */
export async function getCurrentMemberships(): Promise<Membership[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("agency_members")
      .select("agency_id, role, agencies(slug, name)")
      .eq("user_id", user.id);

    if (error) {
      log.error("auth", "getCurrentMemberships query failed", {
        userId: user.id,
        message: error.message,
        code: error.code,
      });
      return [];
    }

    const rows = (data ?? []) as MembershipRow[];

    return rows
      .map((row) => {
        const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
        if (!agency) return null;
        return {
          agencyId: row.agency_id,
          agencySlug: agency.slug,
          agencyName: agency.name,
          role: row.role,
        } satisfies Membership;
      })
      .filter((m): m is Membership => m !== null);
  } catch (err) {
    log.error("auth", "getCurrentMemberships failed", err instanceof Error ? err : { err: String(err) });
    return [];
  }
}
