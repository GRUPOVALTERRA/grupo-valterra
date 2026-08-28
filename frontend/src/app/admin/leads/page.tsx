import { notFound } from "next/navigation";
import { LeadsDashboard } from "@/components/admin/leads/LeadsDashboard";
import { getAllLeads, computeStats, type Lead } from "@/services/mock-leads";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import {
  applyLeadFilters,
  countAttention,
  parseLeadListFilters,
} from "@/lib/admin-lead-filter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consultas - Valterra Admin",
  robots: { index: false, follow: false },
};

/**
 * /admin/leads — bandeja de consultas.
 *
 * Rediseño de navegación (27/08/2026): la barra superior propia y las
 * secciones de equipo (miembros + invitar) salieron de esta página. La
 * navegación vive en el AdminHeader del layout compartido de /admin y la
 * gestión de equipo en /admin/equipo. Esta página queda enfocada en lo suyo:
 * las consultas.
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  let leads: Lead[] = [];
  let dbError: string | null = null;

  try {
    // El scope por agencia se resuelve acá, desde la sesión: los filtros de la
    // URL nunca amplían lo que el operador puede ver.
    leads = await getAllLeads(
      ctx.scopedAgencyId ? { agencyId: ctx.scopedAgencyId } : {},
    );
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    log.error("admin/leads", "error cargando leads", err instanceof Error ? err : { err: String(err) });
  }

  const sp = await searchParams;
  const filters = parseLeadListFilters({ q: sp.q, estado: sp.estado, aviso: sp.aviso });
  const visibleLeads = applyLeadFilters(leads, filters);
  // "Requieren atención" se cuenta sobre TODO el scope, no sobre la vista
  // filtrada: si se contara sobre lo visible, el número desaparecería justo
  // cuando el operador filtra por otra cosa.
  const attentionCount = countAttention(leads);

  const stats = computeStats(visibleLeads);
  // S16-LEAD-OBS PR3 — VISIBILIDAD del reintento (owner/admin del scope o
  // super-admin), resuelta de la sesión. La autorización real la repite la
  // server action contra la agencia del lead; ocultar el botón no autoriza.
  const canRetry =
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === ctx.scopedAgencyId && (m.role === "owner" || m.role === "admin"),
    );

  return (
    <>
      {dbError !== null && (
        <div className="bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Error cargando leads: {dbError}
        </div>
      )}

      <LeadsDashboard
        leads={visibleLeads}
        stats={stats}
        filters={filters}
        totalInScope={leads.length}
        attentionCount={attentionCount}
        canRetry={canRetry}
      />
    </>
  );
}
