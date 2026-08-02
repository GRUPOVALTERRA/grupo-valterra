import Image from "next/image";
import { NewsletterForm } from "./NewsletterForm";
import { SocialLinks } from "./SocialLinks";

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
                <span>Corrientes Capital, Argentina · Atención con cita previa por WhatsApp</span>
              </div>
              <a href="tel:+5493795159096" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">📞</span>
                +54 9 379 515-9096
              </a>
              <a href="mailto:grupovalterraservinmob@gmail.com" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">✉️</span>
                grupovalterraservinmob@gmail.com
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
          <SocialLinks variant="dark" />
        </div>
      </div>
    </footer>
  );
}
