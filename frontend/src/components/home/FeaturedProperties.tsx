import { getFeaturedProperties } from "@/services/mock-properties";
import { PropertyCard } from "./PropertyCard";

export function FeaturedProperties() {
  const properties = getFeaturedProperties(6);

  return (
    <section className="bg-[#f5f1ea]/60 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a86a]">
              ★ Selección curada
            </span>
            <h2 className="mt-3 text-3xl font-semibold text-[#0a2540] md:text-5xl">
              Propiedades destacadas
            </h2>
            <p className="mt-4 text-base text-slate-600">
              Las oportunidades del momento, elegidas por nuestro equipo de asesores expertos en
              el mercado del litoral.
            </p>
          </div>
          <a
            href="#propiedades"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#0a2540] transition-colors hover:text-[#c9a86a]"
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
