import { SearchBar } from "./SearchBar";

export function HeroSection() {
  return (
    <section className="relative isolate min-h-[760px] overflow-hidden pt-24 md:min-h-[840px] md:pt-32">
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=85&auto=format&fit=crop"
        alt=""
        aria-hidden
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      {/* Overlay */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(10,35,66,0.92) 0%, rgba(6,24,48,0.75) 50%, rgba(10,35,66,0.85) 100%)",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-12 md:py-20 lg:px-8">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A86A]/40 bg-[#C9A86A]/15 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#C9A86A]">
            ✦ Premium · Litoral argentino
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] text-white sm:text-5xl md:text-6xl lg:text-[64px]">
            Encontrá tu próximo hogar
            <br />
            en el <span className="text-[#C9A86A]">Litoral.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
            Propiedades premium en Entre Ríos, Corrientes, Chaco y Misiones. Más de 20 años
            asesorando a familias e inversionistas con resultados reales.
          </p>
        </div>

        <div className="mt-10 max-w-4xl">
          <SearchBar />
        </div>

        {/* Mini stats inline */}
        <ul className="mt-12 grid max-w-3xl gap-6 border-t border-white/15 pt-8 sm:grid-cols-3">
          <li className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A86A]/20 ring-1 ring-[#C9A86A]/40 text-[#C9A86A]">
              🏠
            </span>
            <div>
              <div className="text-xl font-semibold">+1.200</div>
              <div className="text-xs uppercase tracking-[0.12em] text-white/70">
                Propiedades publicadas
              </div>
            </div>
          </li>
          <li className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A86A]/20 ring-1 ring-[#C9A86A]/40 text-[#C9A86A]">
              👨‍👩‍👧
            </span>
            <div>
              <div className="text-xl font-semibold">+8.500</div>
              <div className="text-xs uppercase tracking-[0.12em] text-white/70">
                Familias asesoradas
              </div>
            </div>
          </li>
          <li className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A86A]/20 ring-1 ring-[#C9A86A]/40 text-[#C9A86A]">
              ⭐
            </span>
            <div>
              <div className="text-xl font-semibold">20 años</div>
              <div className="text-xs uppercase tracking-[0.12em] text-white/70">
                En el litoral argentino
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
