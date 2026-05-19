import { LeadsDashboard } from "@/components/admin/leads/LeadsDashboard";
import { getAllLeads, computeStats, type Lead } from "@/services/mock-leads";
import { log } from "@/lib/logger";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads · Valterra Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLeadsPage() {
  let leads: Lead[] = [];
  let dbError: string | null = null;

  try {
    leads = await getAllLeads();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    log.error("admin/leads", "error cargando leads", err instanceof Error ? err : { err: String(err) });
  }

  const stats = computeStats(leads);

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D8D8D8] bg-white/95 px-4 py-2 backdrop-blur lg:px-8">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
          Admin · Sesión activa
        </span>
        <LogoutButton />
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
