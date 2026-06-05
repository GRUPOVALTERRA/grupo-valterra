import Link from "next/link";
import { formatPrice, type Property } from "@/services/mock-properties";

interface PublicPropertyCardProps {
  property: Property;
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

export function PublicPropertyCard({ property }: PublicPropertyCardProps) {
  const waMsg = encodeURIComponent(
    `Hola, me interesa la propiedad "${property.title}" en Grupo Valterra. ¿Podría darme más información?`,
  );
  const waLink = `https://wa.me/5493795159096?text=${waMsg}`;
  const location = [property.neighborhood, property.city, property.province]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_-8px_rgba(10,35,66,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,35,66,0.35)]">
      {/* Image — clickable to detail */}
      <Link
        href={`/propiedades/${property.slug}`}
        className="relative block aspect-[4/3] overflow-hidden bg-slate-100"
        aria-label={`Ver detalle de ${property.title}`}
      >
        {property.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.image}
            alt={property.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <svg
              className="h-12 w-12 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
              />
            </svg>
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#0A2342]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {OPERATION_LABEL[property.operation]}
          </span>
          {property.badges?.[0] && (
            <span className="rounded-full bg-[#C9A86A] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#0A2342]">
              {property.badges[0]}
            </span>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col space-y-3 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C9A86A]">
          {TYPE_LABEL[property.type]}
        </div>

        <div className="text-2xl font-semibold text-[#0A2342]">
          {formatPrice(property.price, property.currency)}
          {property.perMonth && (
            <span className="text-sm font-normal text-slate-500">/mes</span>
          )}
        </div>

        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[#0A2342]">
          {property.title}
        </h3>

        {location && (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M12 22s-7-7-7-13a7 7 0 0114 0c0 6-7 13-7 13z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="truncate">{location}</span>
          </p>
        )}

        {/* Specs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#D8D8D8] pt-3 text-xs text-slate-600">
          {typeof property.bedrooms === "number" && (
            <span className="flex items-center gap-1.5">
              <span className="text-[#C9A86A]" aria-hidden>🛏</span>
              {property.bedrooms} dorm.
            </span>
          )}
          {typeof property.bathrooms === "number" && (
            <span className="flex items-center gap-1.5">
              <span className="text-[#C9A86A]" aria-hidden>🚿</span>
              {property.bathrooms} baños
            </span>
          )}
          {typeof property.coveredArea === "number" && (
            <span className="ml-auto flex items-center gap-1.5 font-medium">
              <span className="text-[#C9A86A]" aria-hidden>📐</span>
              {property.coveredArea} m²
            </span>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Link
            href={`/propiedades/${property.slug}`}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0A2342] text-sm font-semibold text-white transition-colors hover:bg-[#0A2342]/90"
          >
            Ver propiedad
          </Link>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#25D366] text-xs font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
            </svg>
            Consultar por WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
