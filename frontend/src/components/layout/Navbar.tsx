"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#comprar", label: "Comprar" },
  { href: "#alquilar", label: "Alquilar" },
  { href: "#emprendimientos", label: "Emprendimientos" },
  { href: "#servicios", label: "Servicios" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#contacto", label: "Contacto" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onDark = !scrolled;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav
        className={`transition-all duration-300 ${
          scrolled
            ? "bg-white/95 shadow-[0_4px_24px_-8px_rgba(10,37,64,0.12)] backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link href="/" aria-label="Inicio Valterra" className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-md font-semibold transition-colors ${
                onDark ? "bg-[#c9a86a] text-[#0a2540]" : "bg-[#0a2540] text-[#c9a86a]"
              }`}
            >
              V
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className={`text-base font-semibold tracking-wide transition-colors ${
                  onDark ? "text-white" : "text-[#0a2540]"
                }`}
              >
                VALTERRA
              </span>
              <span
                className={`text-[9px] font-medium uppercase tracking-[0.2em] transition-colors ${
                  onDark ? "text-[#c9a86a]" : "text-[#c9a86a]"
                }`}
              >
                Servicios Inmobiliarios
              </span>
            </span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    onDark
                      ? "text-white/90 hover:bg-white/10 hover:text-white"
                      : "text-[#0a2540] hover:bg-[#f5f1ea]"
                  }`}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href="#publicar"
              className="inline-flex h-10 items-center rounded-lg bg-[#c9a86a] px-4 text-sm font-semibold text-[#0a2540] shadow-sm transition-all hover:brightness-105 hover:shadow-md"
            >
              Publicar propiedad
            </a>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className={`rounded-md p-2 lg:hidden ${onDark ? "text-white" : "text-[#0a2540]"}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-[#0a2540] transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <span className="text-base font-semibold text-white">VALTERRA</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="rounded-md p-2 text-white hover:bg-white/10"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="space-y-1 px-4 pt-4">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-3 text-lg font-medium text-white hover:bg-white/10"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#publicar"
            onClick={() => setOpen(false)}
            className="mt-4 block rounded-lg bg-[#c9a86a] px-4 py-3 text-center text-base font-semibold text-[#0a2540]"
          >
            Publicar propiedad
          </a>
        </div>
      </div>
    </header>
  );
}
