import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { listAgencies } from "@/services/agencies";
import { CreateAgencyForm } from "./CreateAgencyForm";
import { createAgencyAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agencies - Super-admin - Valterra",
  robots: { index: false, follow: false },
};

export default async function AgenciesPage() {
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin) notFound();

  const agencies = await listAgencies();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header className="flex items-center justify-between border-b border-[#D8D8D8] pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Super-admin · Marketplace
          </span>
          <h1 className="mt-1 text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
            Agencies
          </h1>
        </div>
        <Link href="/admin/leads" className="text-xs font-medium text-[#4A5568] hover:text-[#0A2342]">
          ← Volver a leads
        </Link>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">
            {agencies.length} {agencies.length === 1 ? "agency registrada" : "agencies registradas"}
          </h2>
          <ul className="mt-3 divide-y divide-[#D8D8D8] rounded-lg border border-[#D8D8D8] bg-white">
            {agencies.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-500">Sin agencies todavia.</li>
            ) : (
              agencies.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-semibold text-[#0A2342]">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      /{a.slug} · {a.contact_email ?? "sin email"} · {a.city ?? "-"}
                    </div>
                  </div>
                  <Link
                    href={`/admin/agencies/${a.slug}`}
                    className="rounded-md border border-[#D8D8D8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2342] transition-colors hover:bg-[#F8F7F4]"
                  >
                    Gestionar →
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Crear nueva agency</h2>
          <CreateAgencyForm action={createAgencyAction} />
        </div>
      </section>
    </div>
  );
}
