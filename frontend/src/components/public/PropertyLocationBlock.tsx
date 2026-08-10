import dynamic from "next/dynamic";
import type { PublicLocation } from "@/lib/geo/types";

/**
 * S18 PR3 — bloque "Ubicación" de la ficha pública.
 *
 * Server component: decide si la sección existe. Con `hidden` no se
 * renderiza nada (ni el contenedor), así que el navegador jamás recibe
 * coordenadas. El mapa se carga con dynamic ssr:false porque Leaflet
 * necesita `window`.
 */

const PropertyPublicMap = dynamic(
  () => import("@/components/public/PropertyPublicMap"),
  {
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl border border-[#D8D8D8] bg-slate-50 text-xs text-slate-400">
        Cargando mapa…
      </div>
    ),
  },
);

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
