import Image from "next/image";
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
    <footer className="bg-[#071A32] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3">
              <Image src="/brand/isotipo-vt.svg" alt="Grupo Valterra" width={48} height={48} className="rounded-lg" />
              <div className="flex flex-col leading-tight">
                <span className="text-base font-extrabold tracking-[0.04em] text-white" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
                  GRUPO VALTERRA
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#C9A86A]">
                  Soluciones Inmobiliarias del Litoral
                </span>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
              Patrimonio, confianza y futuro. Compra, venta y alquiler de propiedades premium en
              Entre Ríos, Corrientes, Chaco y Misiones.
            </p>
            <div className="mt-6 space-y-2.5 text-sm text-white/80">
              <div className="flex items-start gap-2.5">
                <span className="text-[#C9A86A]">📍</span>
                <span>Catamarca 1365 Piso 1° Dpto. I, Corrientes, Capital</span>
              </div>
              <a href="tel:+5493795159096" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">📞</span>
                +54 9 379 515-9096
              </a>
              <a href="mailto:contacto@valterra.com.ar" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">✉️</span>
                contacto@valterra.com.ar
              </a>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-5">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#C9A86A]">
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
            <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#C9A86A]">
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
            <a href="#" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
              </svg>
            </a>
            <a href="#" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0022 12z" />
              </svg>
            </a>
            <a href="#" aria-label="LinkedIn" className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.4v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 11.01-4.12 2.06 2.06 0 010 4.12zm-1.78 13.02h3.55V9H3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.72v20.56C0 23.23.8 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
