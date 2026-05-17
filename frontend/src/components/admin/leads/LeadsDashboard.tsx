import type { Lead, LeadStats } from "@/services/mock-leads";
import { LeadStatsCards } from "./LeadStatsCards";
import { LeadFilters } from "./LeadFilters";
import { LeadTable } from "./LeadTable";

/**
 * Dashboard del panel /admin/leads.
 * Composición: header + KPI cards + filtros + tabla.
 *
 * TODO AUTH: proteger /admin/* con NextAuth + middleware y validar rol
 * (admin/agent) antes de servir esta página.
 */

interface LeadsDashboardProps {
  leads: Lead[];
  stats: LeadStats;
}

export function LeadsDashboard({ leads, stats }: LeadsDashboardProps) {
  return (
    <div className="min-h-screen bg-[#f5f1ea]/40 text-[#0a2540]">
      {/* Topbar */}
      <header className="border-b border-[#e8eaef] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0a2540] font-semibold text-[#c9a86a]">
              V
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-[#0a2540]">VALTERRA · Admin</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#c9a86a]">
                Servicios Inmobiliarios
              </div>
            </div>
          </div>
          <a
            href="/"
            className="text-xs font-medium text-slate-600 hover:text-[#0a2540]"
          >
            ← Volver al sitio
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-[#0a2540]">Bandeja de leads</h1>
          <p className="mt-1 text-sm text-slate-600">
            {stats.total} {stats.total === 1 ? "consulta registrada" : "consultas registradas"} ·
            datos mock (memoria)
          </p>
        </div>

        <LeadStatsCards stats={stats} />

        <LeadFilters />

        <LeadTable leads={leads} />

        {/* Footer info */}
        <p className="pt-4 text-center text-xs text-slate-500">
          Panel inicial · sin autenticación todavía · TODO: proteger con NextAuth + rol admin/agent
        </p>
      </main>
    </div>
  );
}
