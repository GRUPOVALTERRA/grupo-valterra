import Image from "next/image";
import { NewsletterForm } from "./NewsletterForm";

/**
 * Enlaces del pie.
 *
 * Sprint 14-B — las tres columnas anteriores apuntaban a anclas inexistentes
 * (#venta, #tasaciones, #nosotros, #blog...). Se conservan sólo destinos
 * reales: filtros del listado y el formulario de contacto. Las secciones sin
 * contenido (Servicios, Empresa, Emprendimientos) se retiraron en vez de
 * prometer páginas que no existen.
 */
const COLUMNS = [
  {
    title: "Propiedades",
    links: [
      { href: "/propiedades?operationType=venta", label: "En venta" },
      { href: "/propiedades?operationType=alquiler", label: "En alquiler" },
      { href: "/propiedades?operationType=alquiler-temporal", label: "Alquiler temporal" },
      { href: "/propiedades", label: "Ver todas" },
    ],
  },
  {
    title: "Contacto",
    links: [
      { href: "/#contacto", label: "Escribinos" },
      { href: "https://wa.me/5493795159096", label: "WhatsApp" },
      { href: "tel:+5493795159096", label: "+54 9 379 515-9096" },
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
              {/*
                Sprint 14-B — se retiró el email de contacto anterior: pertenecía a
                otro dominio y no hay casilla comercial confirmada en el dominio
                propio (la de acceso es sólo remitente de autenticación). Se dejan
                los canales verificables: teléfono, WhatsApp y el formulario.
              */}
              <a
                href="https://wa.me/5493795159096"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 hover:text-[#C9A86A]"
              >
                <span className="text-[#C9A86A]">💬</span>
                WhatsApp
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
            © {year} Grupo Valterra · Soluciones Inmobiliarias del Litoral
          </p>
          {/*
            Sprint 14-B — se retiraron los iconos sociales: apuntaban a "#" y no
            hay perfiles confirmados. Se reponen cuando existan URLs reales.
          */}
        </div>
      </div>
    </footer>
  );
}
