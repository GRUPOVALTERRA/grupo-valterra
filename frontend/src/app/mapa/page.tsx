import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { PropertyFilters } from "@/components/public/PropertyFilters";
import { PropertiesMapView } from "@/components/public/PropertiesMapView";
import { getMapProperties } from "@/services/property-map";
import { getAgencyWhatsappMap } from "@/services/agencies";
import { getAgencyBadgeMap } from "@/services/agency-badges";
import { hasAnyFilter, parsePublicFilters } from "@/lib/public-filters";

/**
 * S26-MAP-01 — mapa estrategico a pantalla completa.
 *
 * Misma vista que `/propiedades?vista=mapa`, con el mapa como
 * protagonista. No duplica logica: monta `PropertiesMapView` y usa el
 * mismo parser de filtros que el listado.
 *
 * Sin Footer a proposito: en una pantalla de mapa el pie compite con el
 * contenido y empuja el mapa fuera de la vista.
 */

export const revalidate = 60;

const TITLE = "Mapa de propiedades";
const DESCRIPTION =
  "Explorá en el mapa las propiedades en venta y alquiler de Grupo Valterra en Corrientes y el NEA: ubicación, precio y contacto directo por WhatsApp.";
const OG_IMAGE = "/brand/og-default.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/mapa" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/mapa",
    siteName: "Grupo Valterra",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Mapa de propiedades Grupo Valterra" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MapaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parsePublicFilters(params);

  const [{ points, withoutLocation }, whatsappByAgency, badgesByAgency] = await Promise.all([
    getMapProperties(filters),
    getAgencyWhatsappMap(),
    getAgencyBadgeMap(),
  ]);

  const total = points.length + withoutLocation.length;
  const listadoHref = hasAnyFilter(filters)
    ? `/propiedades?${new URLSearchParams(
        Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
      ).toString()}`
    : "/propiedades";

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#0A2342]">
      <Navbar />

      <main className="pt-24">
        <section className="mx-auto max-w-[1600px] px-4 pb-4 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
                Portal inmobiliario
              </div>
              <h1 className="text-2xl font-bold md:text-3xl">Mapa de propiedades</h1>
              <p className="mt-1 text-sm text-slate-500">
                {total > 0
                  ? `${points.length} en el mapa${
                      withoutLocation.length > 0
                        ? ` · ${withoutLocation.length} sin ubicación publicada`
                        : ""
                    }`
                  : "No hay propiedades disponibles para estos filtros"}
              </p>
            </div>

            <Link
              href={listadoHref}
              className="inline-flex h-10 items-center rounded-lg border border-[#0A2342]/20 bg-white px-4 text-sm font-semibold text-[#0A2342] transition-colors hover:bg-[#0A2342]/5"
            >
              Ver como lista
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-[1600px] px-4 pb-4 lg:px-8">
          <PropertyFilters currentFilters={filters} basePath="/mapa" />
        </section>

        <section className="mx-auto max-w-[1600px] px-4 pb-8 lg:px-8">
          <PropertiesMapView
            points={points}
            withoutLocation={withoutLocation}
            whatsappByAgency={whatsappByAgency}
            badgesByAgency={badgesByAgency}
            fullScreen
          />
        </section>
      </main>
    </div>
  );
}
