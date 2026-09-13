import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AvailableBanner } from "@/components/public/AvailableBanner";
import { PropertyFilters } from "@/components/public/PropertyFilters";
import { PublicPropertyCard } from "@/components/public/PublicPropertyCard";
import { PropertiesMapView } from "@/components/public/PropertiesMapView";
import { getAllProperties } from "@/services/properties";
import { getMapProperties } from "@/services/property-map";
import { getAgencyWhatsappMap } from "@/services/agencies";
import { getAgencyBadgeMap } from "@/services/agency-badges";
import {
  hasAnyFilter,
  parsePublicFilters,
  parseVista,
  type PublicFilters,
  type PublicVista,
} from "@/lib/public-filters";

export const revalidate = 60;

const LISTING_TITLE = "Propiedades en Venta y Alquiler";
const LISTING_DESCRIPTION =
  "Encontrá tu propiedad ideal en el NEA. Casas, departamentos, locales y terrenos en venta y alquiler en Entre Ríos, Corrientes, Chaco y Misiones.";
const OG_IMAGE = "/brand/og-default.jpg";

export const metadata: Metadata = {
  title: LISTING_TITLE,
  description: LISTING_DESCRIPTION,
  alternates: { canonical: "/propiedades" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/propiedades",
    siteName: "Grupo Valterra",
    title: LISTING_TITLE,
    description: LISTING_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Propiedades Grupo Valterra" }],
  },
  twitter: {
    card: "summary_large_image",
    title: LISTING_TITLE,
    description: LISTING_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

/* ---------- Vista lista | mapa (S26) ---------- */

function hrefConVista(filters: PublicFilters, vista: PublicVista): string {
  const params = new URLSearchParams();
  if (filters.operationType) params.set("operationType", filters.operationType);
  if (filters.propertyType) params.set("propertyType", filters.propertyType);
  if (filters.city) params.set("city", filters.city);
  if (vista === "mapa") params.set("vista", "mapa");
  const qs = params.toString();
  return `/propiedades${qs ? `?${qs}` : ""}`;
}

/* ---------- Page ---------- */

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PropiedadesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const currentFilters = parsePublicFilters(params);
  const vista = parseVista(params.vista);
  const esMapa = vista === "mapa";

  // WhatsApp por agency: cada card consulta a la inmobiliaria dueña.
  const whatsappByAgency = await getAgencyWhatsappMap();

  // Las dos vistas leen el MISMO filtro; solo cambia la lectura.
  const mapa = esMapa ? await getMapProperties(currentFilters) : null;
  const badgesByAgency = esMapa ? await getAgencyBadgeMap() : {};
  const properties = esMapa
    ? []
    : await getAllProperties({
        ...currentFilters,
        limit: 50,
        // Sin propiedades reales publicadas el sitio no muestra el snapshot de
        // muestra: en su lugar se muestra el banner DISPONIBLE de Grupo Valterra.
        allowSampleFallback: false,
      });

  const hasFilters = hasAnyFilter(currentFilters);
  const count = mapa ? mapa.points.length + mapa.withoutLocation.length : properties.length;

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#0A2342]">
      <Navbar />

      <main className="pt-24 md:pt-32">
        {/* Header */}
        <section className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Portal inmobiliario
          </div>
          <h1 className="text-3xl font-bold md:text-4xl">Propiedades</h1>
          <p className="mt-2 text-sm text-slate-500">
            {count > 0
              ? `${count} propiedad${count !== 1 ? "es" : ""} disponible${count !== 1 ? "s" : ""}`
              : hasFilters
                ? "Sin resultados para los filtros seleccionados"
                : "No hay propiedades disponibles en este momento"}
          </p>
        </section>

        {/* Filters */}
        <section className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <PropertyFilters
            currentFilters={currentFilters}
            keepParams={esMapa ? { vista: "mapa" } : undefined}
          />

          <div className="mt-4 inline-flex rounded-lg border border-[#D8D8D8] bg-white p-1">
            <Link
              href={hrefConVista(currentFilters, "lista")}
              aria-current={!esMapa ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold transition-colors ${
                !esMapa ? "bg-[#0A2342] text-white" : "text-[#0A2342] hover:bg-[#0A2342]/5"
              }`}
            >
              Lista
            </Link>
            <Link
              href={hrefConVista(currentFilters, "mapa")}
              aria-current={esMapa ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold transition-colors ${
                esMapa ? "bg-[#0A2342] text-white" : "text-[#0A2342] hover:bg-[#0A2342]/5"
              }`}
            >
              Mapa
            </Link>
          </div>
        </section>

        {/* S26 · vista mapa */}
        {esMapa && mapa ? (
          <section className="mx-auto max-w-[1600px] px-4 pb-16 lg:px-8">
            <PropertiesMapView
              points={mapa.points}
              withoutLocation={mapa.withoutLocation}
              whatsappByAgency={whatsappByAgency}
              badgesByAgency={badgesByAgency}
            />
          </section>
        ) : (
        /* Grid or empty state */
        <section className="mx-auto max-w-7xl px-4 pb-24 lg:px-8">
          {count > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => (
                <PublicPropertyCard
                  key={property.id}
                  property={property}
                  whatsapp={property.agencyId ? whatsappByAgency[property.agencyId] : undefined}
                />
              ))}
            </div>
          ) : !hasFilters ? (
            <div className="overflow-hidden rounded-2xl">
              <AvailableBanner />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0A2342]/5">
                <svg
                  className="h-8 w-8 text-[#0A2342]/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
                  />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold">No encontramos propiedades</p>
                <p className="mt-1 text-sm text-slate-500">
                  {hasFilters
                    ? "Probá con otros filtros o limpiá la búsqueda."
                    : "Volvé pronto, estamos cargando el catálogo."}
                </p>
              </div>
              {hasFilters && (
                <Link
                  href="/propiedades"
                  className="mt-2 inline-flex h-10 items-center rounded-lg bg-[#0A2342] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0A2342]/90"
                >
                  Ver todas las propiedades
                </Link>
              )}
            </div>
          )}
        </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
