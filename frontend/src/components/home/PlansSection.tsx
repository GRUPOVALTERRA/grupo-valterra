const PLANS = [
  {
    name: "Gratis",
    price: "$0",
    period: "/mes",
    description: "Publicá tu propiedad sin costo y empezá a recibir consultas.",
    features: [
      "1 propiedad publicada",
      "Hasta 5 fotos",
      "Visibilidad básica",
      "Consultas por email",
    ],
    cta: "Empezar gratis",
    accent: "border-[#e8eaef]",
    highlight: false,
  },
  {
    name: "Básico",
    price: "$15.000",
    period: "/mes",
    description: "Ideal para propietarios que buscan mejor exposición.",
    features: [
      "Hasta 5 propiedades",
      "Hasta 15 fotos por aviso",
      "Posicionamiento mejorado",
      "Estadísticas básicas",
      "WhatsApp directo",
    ],
    cta: "Activar Básico",
    accent: "border-[#e8eaef]",
    highlight: false,
  },
  {
    name: "VIP",
    price: "$45.000",
    period: "/mes",
    description: "Para agentes y pequeñas inmobiliarias que quieren resultados.",
    features: [
      "Propiedades ilimitadas",
      "Fotos ilimitadas + video",
      "Avisos destacados",
      "Estadísticas avanzadas",
      "Soporte prioritario",
      "Tour virtual incluido",
    ],
    cta: "Activar VIP",
    accent: "border-[#c9a86a] ring-2 ring-[#c9a86a]/30",
    highlight: true,
  },
  {
    name: "Elite",
    price: "$120.000",
    period: "/mes",
    description: "Para inmobiliarias top que necesitan máxima visibilidad.",
    features: [
      "Todo VIP incluido",
      "Posición #1 garantizada",
      "Asesor de cuenta dedicado",
      "Campaña en redes incluida",
      "API + integraciones CRM",
      "Onboarding personalizado",
    ],
    cta: "Hablar con ventas",
    accent: "border-[#0a2540]",
    highlight: false,
  },
];

export function PlansSection() {
  return (
    <section className="bg-[#f5f1ea]/40 py-20 md:py-28" id="planes">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a86a]">
            ✦ Planes para todo tipo de operación
          </span>
          <h2 className="mt-3 text-3xl font-semibold text-[#0a2540] md:text-5xl">
            Elegí el plan que se ajusta a vos
          </h2>
          <p className="mt-4 text-base text-slate-600">
            Desde publicar una sola propiedad hasta gestionar una cartera completa con
            herramientas premium. Cambiá de plan cuando quieras.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,37,64,0.25)] ${plan.accent} ${
                plan.highlight ? "shadow-[0_20px_60px_-20px_rgba(201,168,106,0.45)]" : "shadow-sm"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#c9a86a] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#0a2540]">
                  Más elegido
                </span>
              )}

              <div>
                <h3 className="text-xl font-semibold text-[#0a2540]">{plan.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{plan.description}</p>
              </div>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-[#0a2540]">{plan.price}</span>
                <span className="text-sm text-slate-500">{plan.period}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#c9a86a]/20 text-[#c9a86a]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`mt-7 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                  plan.highlight
                    ? "bg-[#c9a86a] text-[#0a2540] hover:brightness-105"
                    : "border-2 border-[#0a2540] text-[#0a2540] hover:bg-[#0a2540] hover:text-white"
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
