import type { Property } from "@/services/mock-properties";
import { formatPrice } from "@/services/mock-properties";

interface PropertyCardProps {
  property: Property;
}

const OPERATION_LABEL = {
  venta: "En venta",
  alquiler: "En alquiler",
  "alquiler-temporal": "Alquiler temporal",
};

export function PropertyCard({ property }: PropertyCardProps) {
  const waMsg = encodeURIComponent(
    `Hola, vi la propiedad "${property.title}" en Valterra (${formatPrice(
      property.price,
      property.currency,
    )}) y me gustaría más info.`,
  );
  const waLink = `https://wa.me/5493430000000?text=${waMsg}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_-8px_rgba(10,37,64,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,37,64,0.35)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img
          src={property.image}
          alt={property.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Badges */}
        <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#0a2540]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {OPERATION_LABEL[property.operation]}
          </span>
          {property.badges?.slice(0, 1).map((b) => (
            <span
              key={b}
              className="rounded-full bg-[#c9a86a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#0a2540]"
            >
              {b}
            </span>
          ))}
        </div>

        {/* Heart */}
        <button
          type="button"
          aria-label="Guardar favorito"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#0a2540] backdrop-blur-sm transition-all hover:bg-white hover:text-red-500"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col space-y-3 p-5">
        <div className="text-2xl font-semibold text-[#0a2540]">
          {formatPrice(property.price, property.currency)}
          {property.perMonth && (
            <span className="text-sm font-normal text-slate-500">/mes</span>
          )}
        </div>

        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[#0a2540]">
          {property.title}
        </h3>

        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s-7-7-7-13a7 7 0 0114 0c0 6-7 13-7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span className="truncate">
            {[property.neighborhood, property.city, property.province]
              .filter(Boolean)
              .join(", ")}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#e8eaef] pt-3 text-xs text-slate-600">
          {typeof property.bedrooms === "number" && (
            <span className="flex items-center gap-1.5">
              <span className="text-[#c9a86a]">🛏</span> {property.bedrooms} dorm.
            </span>
          )}
          {typeof property.bathrooms === "number" && (
            <span className="flex items-center gap-1.5">
              <span className="text-[#c9a86a]">🚿</span> {property.bathrooms} baños
            </span>
          )}
          {typeof property.parking === "number" && property.parking > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="text-[#c9a86a]">🚗</span> {property.parking}
            </span>
          )}
          {typeof property.coveredArea === "number" && (
            <span className="ml-auto flex items-center gap-1.5 font-medium">
              <span className="text-[#c9a86a]">📐</span> {property.coveredArea} m²
            </span>
          )}
        </div>

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white transition-all hover:brightness-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
          </svg>
          Consultar por WhatsApp
        </a>
      </div>
    </article>
  );
}
