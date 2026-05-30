import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getPropertyBySlug } from "@/services/properties";
import { updatePropertyCoverAction } from "../../actions";
import { EditCoverForm } from "./EditCoverForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editar cover - Admin - Valterra",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditCoverPage({ params }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  const { slug } = await params;
  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property) notFound();

  const allowed = ctx.isSuperAdmin
    || (property.agencyId && ctx.memberships.some((m) => m.agencyId === property.agencyId));
  if (!allowed) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <header className="flex items-center justify-between border-b border-[#D8D8D8] pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Admin · Cover image
          </span>
          <h1 className="mt-1 text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
            {property.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            /{property.slug} · {property.city ?? "-"} · {property.operation}
          </p>
        </div>
        <Link href="/admin/properties" className="text-xs font-medium text-[#4A5568] hover:text-[#0A2342]">
          ← Properties
        </Link>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Imagen actual</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-[#D8D8D8] bg-slate-50">
            {property.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview · simple <img>
              <img
                src={property.image}
                alt={property.title}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center text-xs text-slate-400">
                Sin imagen actual
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            Origen detectado:{" "}
            {property.image?.startsWith("http")
              ? "URL absoluta legacy"
              : property.image
                ? "Supabase Storage path resuelto"
                : "vacio"}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Subir nueva imagen</h2>

          <div className="mt-3 overflow-hidden rounded-lg border border-[#C9A86A]/40 bg-white shadow-[0_4px_16px_-8px_rgba(10,35,66,0.12)]">
            <div className="flex items-center gap-2 border-b border-[#C9A86A]/30 bg-[#0A2342] px-3.5 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A86A" strokeWidth="2.5" aria-hidden>
                <path d="M12 2l2.39 6.95H22l-5.94 4.31 2.27 6.99L12 15.93 5.67 20.25l2.27-6.99L2 8.95h7.61z" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C9A86A]">
                Requisitos para imagen premium Valterra
              </span>
            </div>
            <ul className="space-y-1.5 px-4 py-3 text-[12px] leading-relaxed text-[#0A2342]">
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Usar imagen horizontal, formato apaisado.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Resolucion recomendada minima: 1600 x 1000 px.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Relacion sugerida: 16:10 o similar.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Foto nitida, luminosa y bien encuadrada.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Evitar capturas de WhatsApp, flyers, textos incrustados, marcas de agua o collages.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Evitar imagenes verticales o muy comprimidas.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Priorizar fachada, ambiente principal, vista destacada o espacio de mayor valor comercial.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Tamano maximo permitido: 5 MB.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[#C9A86A]" aria-hidden />
                Formatos aceptados: JPG, PNG o WEBP.
              </li>
            </ul>
            <div className="border-t border-[#D8D8D8] bg-[#F8F7F4]/60 px-4 py-2.5 text-[11px] italic leading-relaxed text-[#4A5568]">
              Las imagenes cargadas se publican como portada de la propiedad. Una foto de baja calidad reduce la percepcion premium del inmueble y de la marca.
            </div>
          </div>

          <div className="mt-3">
            <EditCoverForm action={updatePropertyCoverAction} slug={property.slug} />
          </div>
        </div>
      </section>
    </div>
  );
}
