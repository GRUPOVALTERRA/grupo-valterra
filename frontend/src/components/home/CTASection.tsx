export function CTASection() {
  return (
    <section
      className="relative isolate overflow-hidden py-20 md:py-28"
      style={{
        background:
          "linear-gradient(135deg, #0a2540 0%, #061830 60%, #0a2540 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, #c9a86a 0%, transparent 35%)",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a86a]">
              ✦ Tu próximo paso
            </span>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
              ¿Vendés, alquilás o
              <br />
              buscás invertir?
              <br />
              <span className="text-[#c9a86a]">Hablemos hoy.</span>
            </h2>
            <p className="mt-5 max-w-xl text-base text-white/80">
              Un asesor experto te va a contactar en menos de 24 horas hábiles. Cero compromiso,
              máxima transparencia.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all hover:border-[#c9a86a]/40 hover:bg-white/10">
              <div className="text-3xl">📢</div>
              <h3 className="mt-3 text-xl font-semibold text-white">Publicá tu propiedad</h3>
              <p className="mt-2 text-sm text-white/70">
                La mostramos a +50.000 personas interesadas en el litoral cada mes.
              </p>
              <a
                href="#publicar"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#c9a86a] px-5 text-sm font-bold text-[#0a2540] transition-all hover:brightness-105"
              >
                Empezar ahora →
              </a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all hover:border-[#c9a86a]/40 hover:bg-white/10">
              <div className="text-3xl">💬</div>
              <h3 className="mt-3 text-xl font-semibold text-white">Hablá con un asesor</h3>
              <p className="mt-2 text-sm text-white/70">
                Respuesta rápida por WhatsApp. Sin formularios largos.
              </p>
              <a
                href="https://wa.me/5493430000000"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-white px-5 text-sm font-semibold text-white transition-all hover:bg-white hover:text-[#0a2540]"
              >
                WhatsApp directo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
