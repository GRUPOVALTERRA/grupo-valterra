import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";

/**
 * /admin — Panel principal (home real del área admin).
 *
 * Antes de este rediseño la ruta /admin daba 404 y el "home" de facto era
 * /admin/leads. Ahora el logo, el ítem "Panel" y esta URL llevan a un punto
 * de partida claro con accesos directos a cada sección (máx. 1 clic).
 *
 * Solo lectura de contexto: no toca datos ni permisos. Las tarjetas se
 * filtran por rol igual que la nav del layout (mostrar ≠ autorizar).
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel - Valterra Admin",
  robots: { index: false, follow: false },
};

interface SectionCard {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Tarjeta destacada (Propiedades es la función central del negocio). */
  featured?: boolean;
}

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  "aria-hidden": true as const,
};

export default async function AdminHomePage() {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );
  const scopeLabel = ctx.scopedAgencyName ?? "Sin agencia";

  const cards: SectionCard[] = [
    {
      href: "/admin/properties",
      title: "Propiedades",
      description: "Ver, cargar y editar las propiedades publicadas en el sitio.",
      featured: true,
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M3 10.5L12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: "/admin/leads",
      title: "Consultas",
      description: "Las personas interesadas que escribieron por una propiedad.",
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: "/admin/estadisticas",
      title: "Estadísticas",
      description: "Cuánta gente visita el sitio y qué propiedades miran.",
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M3 21h18" strokeLinecap="round" />
          <path d="M7 21V12M12 21V7M17 21v-5" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  if (isOwner) {
    cards.push({
      href: "/admin/equipo",
      title: "Equipo",
      description: "Los miembros de tu inmobiliaria: invitar, cambiar roles o quitar.",
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    });
  }

  if (ctx.isSuperAdmin) {
    cards.push({
      href: "/admin/agencies",
      title: "Agencias",
      description: "Administración de las inmobiliarias del marketplace (super-admin).",
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M3 21h18M4 21V7l8-4 8 4v14" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6" strokeLinecap="round" />
        </svg>
      ),
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
          Panel principal
        </span>
        <h1
          className="mt-1 text-2xl font-bold text-[#0A2342]"
          style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
        >
          Hola, este es el panel de {scopeLabel}
        </h1>
        <p className="mt-1 text-sm text-[#4A5568]">
          Elegí una sección para empezar. Siempre podés volver acá con el botón{" "}
          <span className="font-semibold">Panel</span> o tocando el logo.
        </p>
      </header>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.href} className={card.featured ? "sm:col-span-2" : undefined}>
            <Link
              href={card.href}
              className={`group flex h-full items-start gap-4 rounded-xl border bg-white p-5 shadow-[0_4px_16px_-10px_rgba(10,35,66,0.18)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2342] ${
                card.featured
                  ? "border-[#C9A86A]/60 hover:border-[#C9A86A]"
                  : "border-[#D8D8D8] hover:border-[#0A2342]/40"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                  card.featured ? "bg-[#0A2342] text-[#C9A86A]" : "bg-[#F8F7F4] text-[#0A2342]"
                }`}
              >
                {card.icon}
              </span>
              <span className="min-w-0">
                <span
                  className="block text-base font-bold text-[#0A2342]"
                  style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
                >
                  {card.title}
                  <span aria-hidden className="ml-1.5 inline-block text-[#C9A86A] transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-[#4A5568]">
                  {card.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-slate-500">
        ¿Querés ver el sitio como lo ve el público?{" "}
        <Link href="/" className="font-semibold text-[#0A2342] underline-offset-2 hover:underline">
          Ver sitio
        </Link>{" "}
        (te lleva a la página pública de Grupo Valterra).
      </p>
    </main>
  );
}
