import type { Property } from "@/services/mock-properties";
import { PropertyCard } from "./PropertyCard";

interface FeaturedPropertiesProps {
  properties: Property[];
}

/**
 * Dumb component: recibe propiedades ya resueltas por el server component padre.
 * El data fetching vive en `src/app/page.tsx` (await getFeaturedProperties).
 */
export function FeaturedProperties({ properties }: FeaturedPropertiesProps) {
  if (properties.length === 0) return null;

  return (
    <section className="bg-[#F8F7F4]/60 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
              ★ Selección curada
            </span>
            <h2 className="mt-3 text-3xl font-bold text-[#0A2342] md:text-5xl">
              Propiedades destacadas
            </h2>
            <p className="mt-4 text-base text-slate-600">
              Las oportunidades del momento, elegidas por nuestro equipo de asesores expertos en
              el mercado del litoral.
            </p>
          </div>
          <a
            href="#propiedades"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#0A2342] transition-colors hover:text-[#C9A86A]"
          >
            Ver todas
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="transition-transform group-hover:translate-x-1"
            >
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
