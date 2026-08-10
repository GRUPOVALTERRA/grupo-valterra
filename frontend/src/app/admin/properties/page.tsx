import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getAllProperties, type PropertyFilters } from "@/services/properties";
import { STATUS_LABEL, effectiveStatus, type PropertyStatus } from "@/lib/property-status";
import {
  ADMIN_STATUS_FILTER_LABEL,
  DEFAULT_STATUS_FILTER,
  parseAdminStatusFilter,
  statusesForFilter,
} from "@/lib/admin-property-filter";
import { normalizeSearchTerm } from "@/lib/property-search";
import { PropertyStatusControls } from "./PropertyStatusControls";
import { PropertyFeaturedToggle } from "./PropertyFeaturedToggle";
import { PropertyListFilters } from "./PropertyListFilters";
import { listAgencies } from "@/services/agencies";

const STATUS_STYLE: Record<PropertyStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  unpublished: "bg-slate-200 text-slate-700",
  archived: "bg-red-100 text-red-800",
};
import { LogoutButton } from "@/app/admin/leads/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Propiedades - Admin - Valterra",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminPropertiesPage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  // Los filtros llegan por la URL y se resuelven acá. Sin `?estado=`, o con uno
  // que no entendemos, el panel muestra las activas: las archivadas se piden.
  const params = await searchParams;
  const statusFilter = parseAdminStatusFilter(params.estado);
  const search = normalizeSearchTerm(params.q);
  const hasFilters = statusFilter !== DEFAULT_STATUS_FILTER || Boolean(search);

  const filters: PropertyFilters = {
    includeDraft: true,
    statuses: statusesForFilter(statusFilter),
    search,
    // El panel ofrece editar y publicar sobre cada fila: no puede listar
    // propiedades de muestra sobre las que esas acciones no existen.
    allowSampleFallback: false,
  };
  // S19 · Ámbito del listado.
  //
  // El super-admin puede ver TODAS las inmobiliarias con `?ambito=todas`
  // (necesario para destacar en portada propiedades de cualquier agencia).
  // Un miembro común queda siempre restringido a su agencia: el parámetro
  // se ignora para él, la restricción no depende de la URL.
  const wantsAllAgencies = ctx.isSuperAdmin && params.ambito === "todas";
  if (!wantsAllAgencies && ctx.scopedAgencyId) {
    filters.agencyId = ctx.scopedAgencyId;
  }
  const properties = await getAllProperties(filters);

  // Nombre de cada inmobiliaria, para identificar las filas cuando se ven
  // todas juntas. Solo se consulta en ese modo.
  const agencyNames = new Map<string, string>();
  if (wantsAllAgencies) {
    try {
      for (const a of await listAgencies()) agencyNames.set(a.id, a.name);
    } catch {
      // No bloquea el listado: sin nombres se muestra igual.
    }
  }

  const scopeLabel = wantsAllAgencies
    ? "Todas las inmobiliarias"
    : ctx.scopedAgencyName ?? "Sin agencia";

  // Publicar/archivar queda para los mismos roles que la RLS trata como
  // managers (owner/admin); agent puede editar pero no cambiar visibilidad.
  const canCreate =
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === ctx.scopedAgencyId && ["owner", "admin", "agent"].includes(m.role),
    );

  // Permiso por fila: el super-admin gestiona cualquier agencia; el resto,
  // solo aquellas donde es owner/admin. La server action revalida igual.
  const canManageAgency = (agencyId?: string) =>
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === agencyId && ["owner", "admin"].includes(m.role),
    );

  const canManage = canManageAgency(ctx.scopedAgencyId ?? undefined);
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
            Consultas
          </Link>
          {ctx.isSuperAdmin && (
            <Link href="/admin/agencies" className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]">
              Agencias
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
            Propiedades
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {total} {total === 1 ? "propiedad visible" : "propiedades visibles"} ·{" "}
            <span className="font-semibold text-[#0A2342]">
              {ADMIN_STATUS_FILTER_LABEL[statusFilter]}
            </span>
            {search ? ` · "${search}"` : ""} · ámbito: {scopeLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {statusFilter === DEFAULT_STATUS_FILTER
              ? "Las archivadas quedan fuera del listado operativo: se ven eligiendo Archivadas o Todas."
              : "Alta como borrador, publicacion y archivado. Galeria y mapa en proximas entregas."}
          </p>
        </header>

        {ctx.isSuperAdmin && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ámbito
            </span>
            <Link
              href="/admin/properties"
              className={`inline-flex h-8 items-center rounded-full border px-3 font-semibold transition-colors ${
                wantsAllAgencies
                  ? "border-[#D8D8D8] bg-white text-[#4A5568] hover:bg-[#F8F7F4]"
                  : "border-[#0A2342] bg-[#0A2342] text-white"
              }`}
            >
              {ctx.scopedAgencyName ?? "Mi inmobiliaria"}
            </Link>
            <Link
              href="/admin/properties?ambito=todas"
              className={`inline-flex h-8 items-center rounded-full border px-3 font-semibold transition-colors ${
                wantsAllAgencies
                  ? "border-[#0A2342] bg-[#0A2342] text-white"
                  : "border-[#D8D8D8] bg-white text-[#4A5568] hover:bg-[#F8F7F4]"
              }`}
            >
              Todas las inmobiliarias
            </Link>
          </div>
        )}

        <PropertyListFilters estado={statusFilter} q={search ?? ""} resultCount={total} />

        {properties.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D8D8D8] bg-white px-6 py-10 text-center text-sm text-slate-500">
            {hasFilters ? (
              <>
                <p>Ninguna property coincide con la busqueda o el estado elegido.</p>
                <p className="mt-1 text-xs text-slate-400">
                  {statusFilter === DEFAULT_STATUS_FILTER
                    ? "Las archivadas no entran en este listado: probá con Archivadas o Todas."
                    : "Probá con otro estado o limpiando la busqueda."}
                </p>
                <span className="mt-3 inline-flex flex-wrap justify-center gap-2">
                  <Link
                    href="/admin/properties"
                    className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
                  >
                    Ver activas
                  </Link>
                  <Link
                    href="/admin/properties?estado=all"
                    className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
                  >
                    Ver todas, incluidas archivadas
                  </Link>
                </span>
              </>
            ) : (
              "Sin properties en este scope."
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[#D8D8D8] rounded-lg border border-[#D8D8D8] bg-white">
            {properties.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-[#0A2342]">{p.title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_STYLE[effectiveStatus(p)]}`}>
                      {STATUS_LABEL[effectiveStatus(p)]}
                    </span>
                    {p.featured && (
                      <span className="rounded bg-[#C9A84C]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#8A6D18]">
                        ★ Portada
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    /{p.slug} · {p.city ?? "-"} · {p.operation} · {p.type}
                    {wantsAllAgencies && p.agencyId && (
                      <> · <span className="font-medium text-[#4A5568]">
                        {agencyNames.get(p.agencyId) ?? "Inmobiliaria"}
                      </span></>
                    )}
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
                  <PropertyFeaturedToggle
                    slug={p.slug}
                    featured={p.featured === true}
                    published={effectiveStatus(p) === "published"}
                    canManage={canManageAgency(p.agencyId)}
                  />
                  <PropertyStatusControls
                    slug={p.slug}
                    status={effectiveStatus(p)}
                    canManage={canManageAgency(p.agencyId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Sprint 15-B · filtro por estado y busqueda sobre el listado.
        </p>
      </div>
    </>
  );
}
