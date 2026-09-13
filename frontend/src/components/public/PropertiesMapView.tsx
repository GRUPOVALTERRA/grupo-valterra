"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { compactPrice } from "@/lib/map/format";
import type { MapPoint, MapPropertyBase } from "@/lib/map/types";
import type { AgencyBadge } from "@/lib/map/badge";

/**
 * S26-MAP-01 — vista lista + mapa (patron Airbnb).
 *
 * Una sola implementacion para las dos superficies: `/propiedades?vista=mapa`
 * (embebida) y `/mapa` (pantalla completa). La diferencia son dos props,
 * no dos componentes que despues divergen.
 *
 * El vinculo lista ⇄ mapa va en los dos sentidos: pasar el mouse por una
 * fila resalta su pastilla, y tocar una pastilla abre la tarjeta.
 *
 * Las propiedades SIN ubicacion publicada se listan igual, al final, con
 * su link (invariante I4: el mapa no puede esconder stock).
 */

// ssr:false es obligatorio: PropertiesMap importa Leaflet en el nivel
// superior del modulo y Leaflet toca `window` al evaluarse. Un componente
// "use client" igual se prerenderiza en el servidor; sin esto el runtime
// loguea `window is not defined` en cada visita (mismo hallazgo que
// PropertyPublicMapLazy, PR #41). Aca es legal porque este archivo ES
// cliente; en un Server Component el App Router lo prohibe.
const PropertiesMap = dynamic(() => import("@/components/public/PropertiesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs text-slate-400">
      Cargando mapa…
    </div>
  ),
});

interface Props {
  points: MapPoint[];
  withoutLocation: MapPropertyBase[];
  whatsappByAgency: Record<string, string>;
  /** agencyId → nombre + logo miniatura para el pin y la tarjeta. */
  badgesByAgency?: Record<string, AgencyBadge>;
  /** /mapa: alto de pantalla y rueda del mouse habilitada. */
  fullScreen?: boolean;
}

function ListRow({
  item,
  active,
  selectable,
  onHover,
  onSelect,
}: {
  item: MapPropertyBase;
  active: boolean;
  selectable: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const location = [item.neighborhood, item.city].filter(Boolean).join(", ");
  return (
    <li
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      className={`rounded-xl border transition-colors ${
        active ? "border-[#C9A86A] bg-[#C9A86A]/5" : "border-[#E6E4DF] bg-white"
      }`}
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          onClick={() => selectable && onSelect(item.id)}
          aria-label={
            selectable ? `Ver ${item.title} en el mapa` : `${item.title} (sin ubicación en el mapa)`
          }
          disabled={!selectable}
          className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 disabled:cursor-default"
        >
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
              Sin foto
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#0A2342]">
            {compactPrice(item.price, item.currency)}
            {item.perMonth && <span className="text-xs font-normal text-slate-500">/mes</span>}
          </div>
          <Link
            href={`/propiedades/${item.slug}`}
            className="line-clamp-2 text-sm leading-snug text-[#0A2342] hover:underline"
          >
            {item.title}
          </Link>
          {location && <p className="truncate text-xs text-slate-500">{location}</p>}
          {!selectable && (
            <p className="mt-1 text-[10px] text-slate-400">Ubicación no publicada</p>
          )}
        </div>
      </div>
    </li>
  );
}

export function PropertiesMapView({
  points,
  withoutLocation,
  whatsappByAgency,
  badgesByAgency,
  fullScreen = false,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"lista" | "mapa">("lista");

  const alto = fullScreen
    ? "h-[calc(100vh-7rem)] min-h-[520px]"
    : "h-[78vh] min-h-[520px]";

  return (
    <div className={`relative w-full ${alto}`}>
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,38%)_1fr]">
        {/* Lista */}
        <div
          className={`h-full overflow-y-auto pr-1 ${
            mobilePane === "lista" ? "block" : "hidden"
          } lg:block`}
        >
          {points.length === 0 && withoutLocation.length === 0 ? (
            <p className="rounded-xl border border-[#E6E4DF] bg-white p-6 text-center text-sm text-slate-500">
              No hay propiedades para estos filtros.
            </p>
          ) : (
            <ul className="space-y-2">
              {points.map((p) => (
                <ListRow
                  key={p.id}
                  item={p}
                  active={p.id === selectedId || p.id === hoveredId}
                  selectable
                  onHover={setHoveredId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setMobilePane("mapa");
                  }}
                />
              ))}

              {withoutLocation.length > 0 && (
                <li className="px-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Sin ubicación publicada
                </li>
              )}
              {withoutLocation.map((p) => (
                <ListRow
                  key={p.id}
                  item={p}
                  active={false}
                  selectable={false}
                  onHover={() => undefined}
                  onSelect={() => undefined}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Mapa */}
        <div
          className={`h-full overflow-hidden rounded-2xl border border-[#D8D8D8] ${
            mobilePane === "mapa" ? "block" : "hidden"
          } lg:block`}
        >
          <PropertiesMap
            points={points}
            whatsappByAgency={whatsappByAgency}
            badgesByAgency={badgesByAgency}
            selectedId={selectedId}
            onSelect={setSelectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            scrollWheelZoom={fullScreen}
            className="h-full w-full"
          />
        </div>
      </div>

      {/* Alternador solo movil: nunca los dos peleando por la pantalla.
          Arriba a la derecha: abajo tapaba la tarjeta (sheet) y la atribucion. */}
      <button
        type="button"
        onClick={() => setMobilePane(mobilePane === "lista" ? "mapa" : "lista")}
        className="absolute right-3 top-3 z-[1200] rounded-full bg-[#0A2342] px-4 py-2 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        {mobilePane === "lista" ? "Ver mapa" : "Ver lista"}
      </button>
    </div>
  );
}
