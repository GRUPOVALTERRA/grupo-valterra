const CATEGORIES = [
  {
    label: "Casas",
    count: "+450 disponibles",
    emoji: "🏠",
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Departamentos",
    count: "+320 disponibles",
    emoji: "🏢",
    image:
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Campos",
    count: "+75 disponibles",
    emoji: "🌾",
    image:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Locales",
    count: "+120 disponibles",
    emoji: "🏪",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Oficinas",
    count: "+60 disponibles",
    emoji: "💼",
    image:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80&auto=format&fit=crop",
  },
  {
    label: "Countries",
    count: "+85 disponibles",
    emoji: "🌳",
    image:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&auto=format&fit=crop",
  },
];

export function CategoriesSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a86a]">
            ✦ Explorá por categoría
          </span>
          <h2 className="mt-3 text-3xl font-semibold text-[#0a2540] md:text-5xl">
            Encontrá lo que buscás, rápido
          </h2>
          <p className="mt-4 text-base text-slate-600">
            Desde residencias frente al río hasta oportunidades de inversión. Una clasificación
            pensada para que ahorres tiempo.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <a
              key={cat.label}
              href={`#cat-${cat.label.toLowerCase()}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-[0_4px_24px_-8px_rgba(10,37,64,0.12)] transition-all hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,37,64,0.35)]"
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
                    "linear-gradient(to top, rgba(10,37,64,0.95) 0%, rgba(10,37,64,0.55) 50%, transparent 100%)",
                }}
              />
              <div className="absolute inset-0 flex flex-col justify-end p-6">
                <span className="text-3xl">{cat.emoji}</span>
                <h3 className="mt-2 text-2xl font-semibold text-white">{cat.label}</h3>
                <p className="mt-1 text-sm text-white/80">{cat.count}</p>
                <span className="mt-3 inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#c9a86a] transition-transform group-hover:translate-x-1">
                  Explorar →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
