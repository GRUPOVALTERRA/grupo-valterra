import Image from "next/image";
import { SocialLinks } from "./SocialLinks";

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
                <span>Corrientes Capital, Argentina · Atención con cita previa por WhatsApp</span>
              </div>
              <a href="tel:+5493795159096" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">📞</span>
                +54 9 379 515-9096
              </a>
              {/*
                S16-SOCIAL — casilla administrativa confirmada por el dueño
                (commit a6b07ae). Reemplaza al email retirado en Sprint 14-B.
              */}
              <a href="mailto:grupovalterraservinmob@gmail.com" className="flex items-center gap-2.5 hover:text-[#C9A86A]">
                <span className="text-[#C9A86A]">✉️</span>
                grupovalterraservinmob@gmail.com
              </a>
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

          <div className="grid gap-8 sm:grid-cols-2 lg:col-span-8">
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

          {/*
            Sprint 15-A — se retiró el bloque de newsletter. El formulario no
            tenía endpoint: descartaba el email y aun así respondía "¡Gracias!
            Te vamos a escribir pronto", una confirmación falsa. Se repone
            cuando exista /api/newsletter con almacenamiento real.
          */}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-white/60">
            © {year} Grupo Valterra · Soluciones Inmobiliarias del Litoral
          </p>
          {/* S16-SOCIAL — URLs oficiales confirmadas, centralizadas en lib/social.ts */}
          <SocialLinks variant="dark" />
        </div>
      </div>
    </footer>
  );
}
