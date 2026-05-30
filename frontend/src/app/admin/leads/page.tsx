import { LeadsDashboard } from "@/components/admin/leads/LeadsDashboard";
import { getAllLeads, computeStats, type Lead } from "@/services/mock-leads";
import { log } from "@/lib/logger";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { getAdminContext } from "@/lib/admin-context";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads - Valterra Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLeadsPage() {
  const ctx = await getAdminContext();

  let leads: Lead[] = [];
  let dbError: string | null = null;

  // Scoping: si hay agency resoluble, filtrar; si no, dejar pasar (caso edge dev local).
  // Sprint 10 MF4: super-admin via ADMIN_TOKEN -> Valterra; user via Supabase -> primera membership.
  try {
    leads = await getAllLeads(
      ctx.scopedAgencyId ? { agencyId: ctx.scopedAgencyId } : {},
    );
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    log.error("admin/leads", "error cargando leads", err instanceof Error ? err : { err: String(err) });
  }

  const stats = computeStats(leads);
  const scopeLabel = ctx.scopedAgencyName ?? "Sin agency";
  const scopeRoleTag = ctx.isSuperAdmin
    ? "Super-admin"
    : ctx.userEmail
      ? ctx.userEmail
      : "Sin auth";

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D8D8] bg-white/95 px-4 py-2 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Admin
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A2342] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white"
            title={ctx.isSuperAdmin ? "Acceso super-admin Valterra" : `Membership: ${ctx.memberships[0]?.role ?? "?"}`}
          >
            <span className="text-[#C9A86A]">Scope:</span> {scopeLabel}
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {scopeRoleTag}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(ctx.scopedAgencyId || ctx.isSuperAdmin) && (
            <Link
              href="/admin/properties"
              className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] transition-colors hover:bg-[#F8F7F4]"
            >
              Properties
            </Link>
          )}
          {ctx.isSuperAdmin && (
            <Link
              href="/admin/agencies"
              className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] transition-colors hover:bg-[#F8F7F4]"
            >
              Agencies
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      {dbError && (
        <div className="bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ No pudimos cargar leads desde la base ({dbError}). Mostrando vista vacía.
        </div>
      )}

      <LeadsDashboard leads={leads} stats={stats} />
    </>
  );
}
