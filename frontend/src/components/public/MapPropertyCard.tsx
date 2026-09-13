"use client";

import Link from "next/link";
import { formatPrice } from "@/services/mock-properties";
import { WaLink } from "@/components/public/WaLink";
import { buildMapWhatsappLink } from "@/lib/map/wa";
import { pinBadgeFor, type AgencyBadge } from "@/lib/map/badge";
import type { MapPoint } from "@/lib/map/types";

/**
 * S26-MAP-01 — tarjeta resumen del pin.
 *
 * Se renderiza en REACT sobre el mapa, no como popup de Leaflet. La
 * diferencia no es estetica: un popup con HTML suelto perderia el
 * `WaLink`, que es el unico emisor de `wa_click`, y el tablero dejaria
 * de ver las consultas que nacen en el mapa.
 *
 * Dos acciones y nada mas: ir a la publicacion, o escribir por WhatsApp
 * a la inmobiliaria dueña.
 */

const OPERATION_LABEL: Record<MapPoint["operation"], string> = {
  venta: "En venta",
  alquiler: "En alquiler",
  "alquiler-temporal": "Alquiler temporal",
};

const TYPE_LABEL: Record<MapPoint["type"], string> = {
  casa: "Casa",
  departamento: "Departamento",
  ph: "PH",
  terreno: "Terreno",
  local: "Local",
  oficina: "Oficina",
  campo: "Campo",
  country: "Country",
};

interface Props {
  property: MapPoint;
  /** WhatsApp de la agencia dueña (digitos wa.me). */
  whatsapp?: string;
  /** Nombre + logo miniatura de la agencia dueña (S26-MAP-02). */
  badge?: AgencyBadge;
  onClose?: () => void;
}

export function MapPropertyCard({ property, whatsapp, badge, onClose }: Props) {
  const waLink = buildMapWhatsappLink(property.title, whatsapp);
  const insignia = badge ? pinBadgeFor(badge) : null;
  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const aproximada = property.location.kind === "approximate";

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-12px_rgba(10,35,66,0.45)] ring-1 ring-black/5">
      <div className="relative">
        <Link
          href={`/propiedades/${property.slug}`}
          className="block aspect-[16/9] overflow-hidden bg-slate-100"
          aria-label={`Ver publicación de ${property.title}`}
        >
          {property.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.image}
              alt={property.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              Sin foto
            </div>
          )}
        </Link>

        <span className="absolute left-3 top-3 rounded-full bg-[#0A2342]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
          {OPERATION_LABEL[property.operation]}
        </span>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[#0A2342] shadow transition-colors hover:bg-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9A86A]">
          {TYPE_LABEL[property.type]}
        </div>

        <div className="text-xl font-semibold leading-none text-[#0A2342]">
          {formatPrice(property.price, property.currency)}
          {property.perMonth && <span className="text-xs font-normal text-slate-500">/mes</span>}
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#0A2342]">
          {property.title}
        </h3>

        {location && <p className="truncate text-xs text-slate-500">{location}</p>}

        {badge && insignia && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#C9A86A] text-[10px] font-bold text-[#0A2342]">
              {insignia.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={insignia.src} alt="" className="h-full w-full object-cover" />
              ) : (
                insignia.initial
              )}
            </span>
            <span className="truncate">Publica {badge.name}</span>
          </p>
        )}

        {(property.bedrooms !== undefined ||
          property.bathrooms !== undefined ||
          property.coveredArea !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#D8D8D8] pt-2 text-[11px] text-slate-600">
            {property.bedrooms !== undefined && <span>{property.bedrooms} dorm.</span>}
            {property.bathrooms !== undefined && <span>{property.bathrooms} baños</span>}
            {property.coveredArea !== undefined && <span>{property.coveredArea} m²</span>}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Link
            href={`/propiedades/${property.slug}`}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0A2342] text-xs font-semibold text-white transition-colors hover:bg-[#0A2342]/90"
          >
            Ver propiedad
          </Link>
          <WaLink
            href={waLink}
            source="card-mapa"
            propertySlug={property.slug}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#25D366] text-xs font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
            </svg>
            Consultar por WhatsApp
          </WaLink>
        </div>

        <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
          {aproximada
            ? "Ubicación aproximada: el círculo indica la zona, no el domicilio exacto."
            : "Ubicación de referencia."}{" "}
          Orientativa: no reemplaza mensura, título, plano ni límites catastrales.
        </p>
      </div>
    </article>
  );
}
