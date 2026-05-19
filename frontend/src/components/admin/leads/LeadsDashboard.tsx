import Image from "next/image";
import Link from "next/link";
import type { Lead, LeadStats } from "@/services/mock-leads";
import { LeadStatsCards } from "./LeadStatsCards";
import { LeadFilters } from "./LeadFilters";
import { LeadTable } from "./LeadTable";

/**
 * Dashboard del panel /admin/leads.
 * Composición: topbar + heading + KPI cards + filtros + tabla.
 */

interface LeadsDashboardProps {
  leads: Lead[];
  stats: LeadStats;
}

export function LeadsDashboard({ leads, stats }: LeadsDashboardProps) {
  return (
    <div className="min-h-screen bg-[#F8F7F4]/40 text-[#0A2342]">
      <header className="border-b border-[#D8D8D8] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/isotipo-vt.svg"
              alt="Grupo Valterra"
              width={36}
              height={36}
              priority
              className="rounded-md"
            />
            <div className="leading-tight">
              <div
                className="text-sm font-extrabold tracking-[0.04em] text-[#0A2342]"
                style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
              >
                GRUPO VALTERRA · ADMIN
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#C9A86A]">
                Soluciones Inmobiliarias del Litoral
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-[#4A5568] transition-colors hover:text-[#0A2342]"
          >
            ← Volver al sitio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
        <div>
          <h1
            className="text-3xl font-bold text-[#0A2342]"
            style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
          >
            Bandeja de leads
          </h1>
          <p className="mt-1 text-sm text-[#4A5568]">
            {stats.total} {stats.total === 1 ? "consulta registrada" : "consultas registradas"}
          </p>
        </div>

        <LeadStatsCards stats={stats} />

        <LeadFilters />

        <LeadTable leads={leads} />

        <p className="pt-4 text-center text-xs text-slate-500">
          Panel admin · auth básica · próxima fase: NextAuth + roles multi-inmobiliaria.
        </p>
      </main>
    </div>
  );
}
