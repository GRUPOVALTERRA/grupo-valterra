import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { AdminBreadcrumbs } from "@/components/admin/nav/AdminBreadcrumbs";
import { PropertyCreateForm } from "./PropertyCreateForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nueva propiedad" };

export default async function NewPropertyPage() {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  // Un viewer no puede dar de alta: se bloquea antes de mostrar el formulario.
  const canCreate =
    ctx.isSuperAdmin ||
    ctx.memberships.some(
      (m) => m.agencyId === ctx.scopedAgencyId && ["owner", "admin", "agent"].includes(m.role),
    );
  if (!canCreate) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <AdminBreadcrumbs
        items={[
          { label: "Panel", href: "/admin" },
          { label: "Propiedades", href: "/admin/properties" },
          { label: "Nueva propiedad" },
        ]}
      />
      <Link
        href="/admin/properties"
        className="mt-2 inline-block text-xs font-semibold text-slate-500 hover:text-[#0A2342]"
      >
        ← Volver a Propiedades
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-[#0A2342]">Nueva propiedad</h1>
      <p className="mt-1 text-xs text-slate-500">
        Ámbito: {ctx.scopedAgencyName ?? "Sin agencia"}
      </p>
      <div className="mt-6">
        <PropertyCreateForm />
      </div>
    </div>
  );
}
