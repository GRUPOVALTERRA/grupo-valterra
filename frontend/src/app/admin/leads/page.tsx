import { LeadsDashboard } from "@/components/admin/leads/LeadsDashboard";
import { MOCK_LEADS, computeStats } from "@/services/mock-leads";

/**
 * Ruta /admin/leads
 *
 * Server Component que consume el mock service.
 * Cuando exista DB real, reemplazar MOCK_LEADS por await leadsService.list().
 *
 * TODO AUTH: agregar middleware que verifique sesión + rol antes de servir.
 */

export const metadata = {
  title: "Leads · Valterra Admin",
  robots: { index: false, follow: false },
};

export default function AdminLeadsPage() {
  const leads = MOCK_LEADS;
  const stats = computeStats(leads);
  return <LeadsDashboard leads={leads} stats={stats} />;
}
