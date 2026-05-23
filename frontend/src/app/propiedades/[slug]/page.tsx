import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactSection } from "@/components/home/ContactSection";
import { getPropertyBySlug } from "@/services/properties";
import { formatPrice, type Property } from "@/services/mock-properties";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const OPERATION_LABEL: Record<Property["operation"], string> = {
  venta: "En venta",
  alquiler: "En alquiler",
  "alquiler-temporal": "Alquiler temporal",
};

const TYPE_LABEL: Record<Property["type"], string> = {
  casa: "Casa",
  departamento: "Departamento",
  ph: "PH",
  terreno: "Terreno",
  local: "Local",
  oficina: "Oficina",
  campo: "Campo",
  country: "Country",
};

function locationText(p: Property): string {
  return [p.neighborhood, p.city, p.province].filter(Boolean).join(", ");
}

/* ---------- Metadata dinámica (Guardrail 1 · SEO/marketplace ready) ---------- */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);

  if (!property) {
    return {
      title: "Propiedad no encontrada",
      description: "La propiedad que buscás ya no está disponible.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${property.title} · ${property.city}`;
  const price = formatPrice(property.price, property.currency);
  const opLabel = OPERATION_LABEL[property.operation];
  const typeLabel = TYPE_LABEL[property.type];
  const description = `${typeLabel} ${opLabel.toLowerCase()} en ${locationText(property)}. ${price}. Grupo Valterra · Soluciones Inmobiliarias del Litoral.`;
  const image = property.image || "/brand/og-default.jpg";
  const url = `/propiedades/${property.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url,
      siteName: "Grupo Valterra",
      title,
      description,
      images: [{ url: image, width: 1200, height: 800, alt: property.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/* ---------- Page ---------- */

export default async function PropertyDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);
  if (!property) notFound();

  const price = formatPrice(property.price, property.currency);
  const waMsg = encodeURIComponent(
    `Hola, vi la propiedad "${property.title}" en Grupo Valterra (${price}) y me gustaría más info.`,
  );
  const waLink = `https://wa.me/5493795159096?text=${waMsg}`;
  const operationLabel = OPERATION_LABEL[property.operation];

  return (
    <div className="bg-white text-[#0A2342]">
      <Navbar />

      <main className="pt-24 md:pt-32">
        {/* Breadcrumb */}
        <nav className="mx-auto max-w-7xl px-4 pb-4 text-xs text-slate-500 lg:px-8" aria-label="breadcrumb">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="hover:text-[#0A2342]">Inicio</Link></li>
            <li aria-hidden>›</li>
            <li><Link href="/#propiedades" className="hover:text-[#0A2342]">Propiedades</Link></li>
            <li aria-hidden>›</li>
            <li className="truncate text-[#0A2342] font-medium">{property.title}</li>
          </ol>
        </nav>

        {/* Hero detalle */}
        <section className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-[#D8D8D8] bg-white shadow-[0_20px_60px_-20px_rgba(10,35,66,0.18)]">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
              {property.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- hero remoto · Sprint 11 migra a next/image + remotePatterns
                <img
                  src={property.image}
                  alt={property.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <div className="absolute left-5 top-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#0A2342]/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                  {operationLabel}
                </span>
                {property.badges?.slice(0, 2).map((b) => (
                  <span key={b} className="rounded-full bg-[#C9A86A] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0A2342]">
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
                  {TYPE_LABEL[property.type]} · {operationLabel}
                </span>
                <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
                  {property.title}
                </h1>
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s-7-7-7-13a7 7 0 0114 0c0 6-7 13-7 13z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  {locationText(property)}
                </p>

                {/* Specs grid */}
                <ul className="mt-8 grid grid-cols-2 gap-4 border-t border-[#D8D8D8] pt-6 sm:grid-cols-4">
                  {typeof property.bedrooms === "number" && (
                    <Spec icon="🛏" label="Dormitorios" value={String(property.bedrooms)} />
                  )}
                  {typeof property.bathrooms === "number" && (
                    <Spec icon="🚿" label="Baños" value={String(property.bathrooms)} />
                  )}
                  {typeof property.parking === "number" && property.parking > 0 && (
                    <Spec icon="🚗" label="Cocheras" value={String(property.parking)} />
                  )}
                  {typeof property.coveredArea === "number" && (
                    <Spec icon="📐" label="Cubiertos" value={`${property.coveredArea} m²`} />
                  )}
                  {typeof property.totalArea === "number" && (
                    <Spec icon="🌳" label="Terreno" value={`${property.totalArea} m²`} />
                  )}
                </ul>
              </div>

              {/* Sidebar precio + CTA */}
              <aside className="lg:border-l lg:border-[#D8D8D8] lg:pl-8">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Precio</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0A2342]">
                  {price}
                  {property.perMonth && <span className="ml-1 text-sm font-normal text-slate-500">/mes</span>}
                </div>

                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-bold text-white transition-all hover:brightness-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
                  </svg>
                  Consultar por WhatsApp
                </a>

                <a
                  href={`#contacto-${property.slug}`}
                  className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-lg border border-[#0A2342] text-sm font-bold text-[#0A2342] transition-colors hover:bg-[#0A2342] hover:text-white"
                >
                  Enviar consulta por formulario
                </a>

                {property.agentName && (
                  <div className="mt-6 rounded-xl bg-[#F8F7F4]/60 p-4 text-sm text-slate-600">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Asesor</div>
                    <div className="mt-1 font-semibold text-[#0A2342]">{property.agentName}</div>
                  </div>
                )}
              </aside>
            </div>

            {/* Descripción (si existe en el type futuro, por ahora null-safe) */}
          </div>
        </section>

        {/* Reusa el formulario de contacto · el ContactSection ya detecta #contacto-<slug> */}
        <ContactSection />
      </main>

      <Footer />
    </div>
  );
}

function Spec({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="text-2xl" aria-hidden>{icon}</span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="text-base font-semibold text-[#0A2342]">{value}</div>
      </div>
    </li>
  );
}
