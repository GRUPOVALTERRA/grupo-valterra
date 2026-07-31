import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getAllProperties, type PropertyFilters } from "@/services/properties";
import { STATUS_LABEL, type PropertyStatus } from "@/lib/property-status";
import { PropertyStatusControls } from "./PropertyStatusControls";

const STATUS_STYLE: Record<PropertyStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  unpublished: "bg-slate-200 text-slate-700",
  archived: "bg-red-100 text-red-800",
};

/** Estado efectivo: `status` si existe, si no se deriva de `published`. */
function statusOf(p: { status?: PropertyStatus; published?: boolean }): PropertyStatus {
  return p.status ?? (p.published ? "published" : "draft");
}
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

  // Publicar/archivar queda para los mismos roles que la RLS trata como
  // managers (owner/admin); agent puede editar pero no cambiar visibilidad.
  const canCreate =
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === ctx.scopedAgencyId && ["owner", "admin", "agent"].includes(m.role),
    );

  const canManage =
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === ctx.scopedAgencyId && ["owner", "admin"].includes(m.role),
    );
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
          {canCreate && (
            <Link href="/admin/properties/new" className="inline-flex h-9 items-center rounded-md bg-[#0A2342] px-3 text-xs font-semibold text-white hover:brightness-110">
              + Nueva propiedad
            </Link>
          )}
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
            Alta como borrador, publicacion y archivado. Galeria y mapa en proximas entregas.
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
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_STYLE[statusOf(p)]}`}>
                      {STATUS_LABEL[statusOf(p)]}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    /{p.slug} · {p.city ?? "-"} · {p.operation} · {p.type}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/properties/${p.slug}/edit`}
                    className="inline-flex h-8 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
                  >
                    Editar datos
                  </Link>
                  <Link
                    href={`/admin/properties/${p.slug}/edit-cover`}
                    className="inline-flex h-8 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
                  >
                    Editar imagen
                  </Link>
                  <PropertyStatusControls
                    slug={p.slug}
                    status={statusOf(p)}
                    canManage={canManage}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Sprint 15-A · alta, ciclo de vida y permisos por agencia.
        </p>
      </div>
    </>
  );
}
