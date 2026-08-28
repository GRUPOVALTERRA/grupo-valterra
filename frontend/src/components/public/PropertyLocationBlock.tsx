import PropertyPublicMap from "@/components/public/PropertyPublicMapLazy";
import type { PublicLocation } from "@/lib/geo/types";

/**
 * S18 PR3 — bloque "Ubicación" de la ficha pública.
 *
 * Server component: decide si la sección existe. Con `hidden` no se
 * renderiza nada (ni el contenedor), así que el navegador jamás recibe
 * coordenadas.
 *
 * El mapa llega por `PropertyPublicMapLazy`, que es quien aplica
 * `ssr: false` — Leaflet necesita `window` y ese flag no puede declararse
 * desde acá, porque App Router lo prohíbe dentro de un Server Component.
 * Ver el encabezado de ese archivo.
 */

interface Props {
  location: PublicLocation;
  /** Texto legible de la zona (barrio, ciudad, provincia). */
  locationLabel?: string;
}

export function PropertyLocationBlock({ location, locationLabel }: Props) {
  if (location.kind === "hidden") return null;

  return (
    <section className="mx-auto mt-12 max-w-7xl px-4 lg:px-8">
      <h2
        className="text-xl font-bold text-[#0A2342]"
        style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
      >
        Ubicación
      </h2>
      {locationLabel && (
        <p className="mt-1 text-sm text-slate-500">{locationLabel}</p>
      )}

      <div className="mt-4">
        <PropertyPublicMap location={location} />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        {location.kind === "approximate"
          ? "Ubicación aproximada: el círculo indica la zona, no el domicilio exacto."
          : "Ubicación de referencia."}{" "}
        La posición es orientativa y no reemplaza mensura, título, plano ni
        límites catastrales.
      </p>
    </section>
  );
}
