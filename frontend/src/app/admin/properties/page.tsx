import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getAllProperties, type PropertyFilters } from "@/services/properties";
import { LogoutButton } from "@/app/admin/leads/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Properties - Admin - Valterra",
  robots: { index: false, follow: false },
};

export default async function AdminPropertiesPage() {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  const filters: PropertyFilters = { includeDraft: true };
  if (!ctx.isSuperAdmin && ctx.scopedAgencyId) {
    filters.agencyId = ctx.scopedAgencyId;
  } else if (ctx.isSuperAdmin && ctx.scopedAgencyId) {
    filters.agencyId = ctx.scopedAgencyId;
  }
  const properties = await getAllProperties(filters);

  const scopeLabel = ctx.scopedAgencyName ?? "Sin agency";
  const draftCount = properties.filter((p) => !p.featured).length; // proxy visible
  const total = properties.length;

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D8D8] bg-white/95 px-4 py-2 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">Admin</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0A2342] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
            <span className="text-[#C9A86A]">Scope:</span> {scopeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/leads" className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]">
            Leads
          </Link>
          {ctx.isSuperAdmin && (
            <Link href="/admin/agencies" className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]">
              Agencies
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
            Properties
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {total} {total === 1 ? "property visible" : "properties visibles"} · scope: {scopeLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            MF2 MVP: cover image upload disponible por property. Edit completo y gallery en futuras MF.
          </p>
        </header>

        {properties.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D8D8D8] bg-white px-6 py-10 text-center text-sm text-slate-500">
            Sin properties en este scope.
          </div>
        ) : (
          <ul className="divide-y divide-[#D8D8D8] rounded-lg border border-[#D8D8D8] bg-white">
            {properties.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-[#0A2342]">{p.title}</span>
                    {!p.featured && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                        no featured
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    /{p.slug} · {p.city ?? "-"} · {p.operation} · {p.type}
                  </div>
                </div>
                <Link
                  href={`/admin/properties/${p.slug}/edit-cover`}
                  className="inline-flex h-8 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
                >
                  Editar imagen →
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Sprint 11 MF2 · cover upload · usa MF1 storage primitives. {draftCount > 0 ? `(${draftCount} sin featured)` : null}
        </p>
      </div>
    </>
  );
}
