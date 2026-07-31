import Link from "next/link";

/**
 * Categorías del home.
 *
 * Sprint 14-B — se retiraron los conteos ("+450 disponibles", etc.): eran
 * cifras no respaldadas por el catálogo. Cada tarjeta ahora enlaza al listado
 * filtrado por `propertyType`, que es el parámetro real que acepta
 * /propiedades, en vez de un ancla inexistente (#cat-casas).
 */
const CATEGORIES = [
  {
    label: "Casas",
    propertyType: "casa",
    emoji: "\u{1F3E0}",
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Departamentos",
    propertyType: "departamento",
    emoji: "\u{1F3E2}",
    image:
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Campos",
    propertyType: "campo",
    emoji: "\u{1F33E}",
    image:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Locales",
    propertyType: "local",
    emoji: "\u{1F3EA}",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Oficinas",
    propertyType: "oficina",
    emoji: "\u{1F4BC}",
    image:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Countries",
    propertyType: "country",
    emoji: "\u{1F333}",
    image:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&auto=format&fit=crop",
  },
];
export function CategoriesSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            ✦ Explorá por categoría
          </span>
          <h2 className="mt-3 text-3xl font-bold text-[#0A2342] md:text-5xl">
            Encontrá lo que buscás, rápido
          </h2>
          <p className="mt-4 text-base text-slate-600">
            Desde residencias frente al río hasta oportunidades de inversión. Una clasificación
            pensada para que ahorres tiempo.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.label}
              href={`/propiedades?propertyType=${cat.propertyType}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-[0_4px_24px_-8px_rgba(10,35,66,0.12)] transition-all hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,35,66,0.35)]"
            >
              <img
                src={cat.image}
                alt={cat.label}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(10,35,66,0.95) 0%, rgba(10,35,66,0.55) 50%, transparent 100%)",
                }}
              />
              <div className="absolute inset-0 flex flex-col justify-end p-6">
                <span className="text-3xl">{cat.emoji}</span>
                <h3 className="mt-2 text-2xl font-semibold text-white">{cat.label}</h3>
                <span className="mt-3 inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#C9A86A] transition-transform group-hover:translate-x-1">
                  Explorar →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
