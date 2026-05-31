import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getPropertyBySlug } from "@/services/properties";
import { updatePropertyDetailsAction } from "../../actions";
import { PropertyEditForm } from "./PropertyEditForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editar property - Admin - Valterra",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditPropertyPage({ params }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  const { slug } = await params;
  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property) notFound();

  const allowed = ctx.isSuperAdmin
    || (property.agencyId && ctx.memberships.some((m) => m.agencyId === property.agencyId));
  if (!allowed) notFound();

  // Reconstruir per_month / published / etc. desde el Property mapeado.
  // El Property tipo NO expone published directamente. Hacemos un fetch al row si necesitamos.
  // Para MF3: published default true · si el caller necesita el real, el server action
  // lo reescribe segun el form. Aca pasamos true por default (UI puede toggle).
  // Si la property esta unpublished, no aparece en /propiedades publico igualmente.

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header className="flex items-center justify-between border-b border-[#D8D8D8] pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Admin · Editar property
          </span>
          <h1
            className="mt-1 text-2xl font-bold text-[#0A2342]"
            style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
          >
            {property.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            /{property.slug} · {property.city ?? "-"} · {property.operation}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/properties/${property.slug}/edit-cover`}
            className="text-xs font-medium text-[#4A5568] hover:text-[#0A2342]"
          >
            Editar imagen →
          </Link>
          <Link href="/admin/properties" className="text-xs font-medium text-[#4A5568] hover:text-[#0A2342]">
            ← Properties
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <PropertyEditForm
          action={updatePropertyDetailsAction}
          slug={property.slug}
          property={property}
        />
      </div>
    </div>
  );
}
