import type { Lead, LeadStats } from "@/services/mock-leads";
import { activeFilterCount, type LeadListFilters } from "@/lib/admin-lead-filter";
import { LeadStatsCards } from "./LeadStatsCards";
import { LeadFilters } from "./LeadFilters";
import { LeadTable } from "./LeadTable";

/**
 * Dashboard del panel /admin/leads.
 * Composición: heading + KPI cards + filtros + tabla.
 *
 * Rediseño de navegación (27/08/2026): el header con logo y "Volver al sitio"
 * que vivía acá se reemplazó por el AdminHeader persistente del layout de
 * /admin. Este componente ya no dibuja chrome de navegación.
 */

interface LeadsDashboardProps {
  /** Leads ya filtrados por la página (server-side). */
  leads: Lead[];
  stats: LeadStats;
  filters: LeadListFilters;
  /** Total del scope de la agencia, sin filtrar. */
  totalInScope: number;
  /** Cuántos avisos reclaman atención en todo el scope. Excluye históricos. */
  attentionCount: number;
  /** S16-LEAD-OBS PR3: visibilidad del reintento (rol resuelto server-side). */
  canRetry: boolean;
}

export function LeadsDashboard({
  leads,
  stats,
  filters,
  totalInScope,
  attentionCount,
  canRetry,
}: LeadsDashboardProps) {
  const isFiltered = activeFilterCount(filters) > 0;
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
      <div>
        <h1
          className="text-2xl font-bold text-[#0A2342]"
          style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
        >
          Consultas
        </h1>
        <p className="mt-1 text-sm text-[#4A5568]">
          {isFiltered ? (
            <>
              {leads.length} de {totalInScope}{" "}
              {totalInScope === 1 ? "consulta" : "consultas"} tras aplicar los filtros
            </>
          ) : (
            <>
              {totalInScope}{" "}
              {totalInScope === 1 ? "consulta registrada" : "consultas registradas"}
            </>
          )}
          {attentionCount > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-amber-700">
                {attentionCount}{" "}
                {attentionCount === 1 ? "requiere atención" : "requieren atención"}
              </span>
            </>
          )}
        </p>
      </div>

      <LeadStatsCards stats={stats} />

      <LeadFilters filters={filters} resultCount={leads.length} />

      <LeadTable leads={leads} canRetry={canRetry} />
    </main>
  );
}
