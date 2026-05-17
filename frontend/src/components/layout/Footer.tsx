import { NewsletterForm } from "./NewsletterForm";

const COLUMNS = [
  {
    title: "Propiedades",
    links: [
      { href: "#venta", label: "En venta" },
      { href: "#alquiler", label: "En alquiler" },
      { href: "#temporal", label: "Alquiler temporal" },
      { href: "#emprendimientos", label: "Emprendimientos" },
    ],
  },
  {
    title: "Servicios",
    links: [
      { href: "#tasaciones", label: "Tasaciones" },
      { href: "#administracion", label: "Administración" },
      { href: "#inversiones", label: "Inversiones" },
      { href: "#asesoramiento", label: "Asesoramiento legal" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: "#nosotros", label: "Nosotros" },
      { href: "#equipo", label: "Equipo" },
      { href: "#blog", label: "Blog" },
      { href: "#trabajar", label: "Trabajá con nosotros" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-[#0a2540] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#c9a86a] font-semibold text-[#0a2540]">
                V
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-semibold text-white">VALTERRA</span>
                <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#c9a86a]">
                  Servicios Inmobiliarios
                </span>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
              Compra, venta y alquiler de propiedades premium en el litoral argentino. Más de
              20 años conectando familias con la propiedad correcta.
            </p>
            <div className="mt-6 space-y-2.5 text-sm text-white/80">
              <div className="flex items-start gap-2.5">
                <span className="text-[#c9a86a]">📍</span>
                <span>Av. Ramírez 1234, Paraná, Entre Ríos</span>
              </div>
              <a href="tel:+5493430000000" className="flex items-center gap-2.5 hover:text-[#c9a86a]">
                <span className="text-[#c9a86a]">📞</span>
                +54 9 343 000-0000
              </a>
              <a
                href="mailto:contacto@valterra.com.ar"
                className="flex items-center gap-2.5 hover:text-[#c9a86a]"
              >
                <span className="text-[#c9a86a]">✉️</span>
                contacto@valterra.com.ar
              </a>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-5">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#c9a86a]">
                  {col.title}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-sm text-white/75 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#c9a86a]">
              Newsletter
            </h4>
            <p className="mt-4 text-sm text-white/70">
              Recibí las mejores oportunidades del litoral antes que nadie.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-white/60">
            © {year} Grupo Valterra · CUIT 30-00000000-0 · Mat. CCIPER 0000
          </p>
          <div className="flex items-center gap-2">
            {["IG", "FB", "IN"].map((s) => (
              <a
                key={s}
                href="#"
                aria-label={s}
                className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
