const STATS = [
  { value: "20+", label: "Años en el mercado", description: "Trayectoria comprobada" },
  { value: "1.200+", label: "Propiedades", description: "En cartera activa" },
  { value: "8.500+", label: "Familias asesoradas", description: "Operaciones cerradas" },
  { value: "98%", label: "Satisfacción", description: "Clientes que nos recomiendan" },
];

export function StatsSection() {
  return (
    <section
      className="relative isolate overflow-hidden py-20 md:py-24"
      style={{
        background:
          "linear-gradient(135deg, #0A2342 0%, #071A32 50%, #0A2342 100%)",
      }}
    >
      {/* Subtle pattern overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #C9A86A 0%, transparent 40%), radial-gradient(circle at 80% 70%, #C9A86A 0%, transparent 40%)",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            ✦ Trayectoria con resultados
          </span>
          <h2 className="mt-3 text-3xl font-bold text-white md:text-5xl">
            Números que respaldan
            <br />
            cada operación
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-[#C9A86A]/40 hover:bg-white/10"
            >
              <div className="text-5xl font-bold text-[#C9A86A]">{s.value}</div>
              <div className="mt-3 text-sm font-semibold uppercase tracking-[0.1em] text-white">
                {s.label}
              </div>
              <div className="mt-1 text-xs text-white/70">{s.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
