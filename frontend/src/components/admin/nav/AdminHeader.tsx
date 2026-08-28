"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

/**
 * AdminHeader — header persistente del panel /admin (rediseño de navegación).
 *
 * Regla del brief: "el usuario nunca debe preguntarse dónde está ni cómo
 * volver". El header es el ÚNICO sistema de navegación principal del panel:
 * las páginas no duplican barras propias.
 *
 * - Logo + "GRUPO VALTERRA · ADMIN" → siempre al panel principal (/admin).
 * - Nav principal con estado activo (aria-current="page").
 * - "Ver sitio" (sitio público) claramente separado y con jerarquía menor.
 * - Mobile: menú desplegable; Panel/Propiedades nunca se ocultan del flujo.
 *
 * SEGURIDAD: este componente solo MUESTRA enlaces que el layout ya resolvió
 * server-side desde getAdminContext(). No decide permisos: la autorización
 * real vive en middleware + server actions + RLS.
 */

export interface AdminNavItem {
  href: string;
  label: string;
  /** true → activo solo con match exacto (caso Panel = /admin). */
  exact?: boolean;
}

interface AdminHeaderProps {
  /** Ítems de navegación ya filtrados por rol (server-side). */
  items: AdminNavItem[];
  /** Nombre de la inmobiliaria del scope (o "Todas" para super-admin). */
  scopeLabel: string;
  /** Identificación del usuario: email o "Super-admin". */
  userLabel: string;
}

function isActive(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const EXTERNAL_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function AdminHeader({ items, scopeLabel, userLabel }: AdminHeaderProps) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#D8D8D8] bg-white/95 backdrop-blur">
      {/* Fila 1: identidad + usuario + acciones globales */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
        <Link
          href="/admin"
          aria-label="Ir al panel principal"
          className="flex min-w-0 items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2342]"
        >
          <Image
            src="/brand/isotipo-vt.svg"
            alt=""
            width={34}
            height={34}
            priority
            className="rounded-md"
          />
          <span className="min-w-0 leading-tight">
            <span
              className="block truncate text-sm font-extrabold tracking-[0.04em] text-[#0A2342]"
              style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
            >
              GRUPO VALTERRA · ADMIN
            </span>
            <span className="block truncate text-[10px] uppercase tracking-[0.16em] text-[#C9A86A]">
              {scopeLabel}
            </span>
          </span>
        </Link>

        {/* Derecha (desktop): usuario · Ver sitio · Cerrar sesión */}
        <div className="hidden items-center gap-2 lg:flex">
          <span className="max-w-[220px] truncate text-[11px] text-slate-500" title={userLabel}>
            {userLabel}
          </span>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-[#4A5568] transition-colors hover:bg-[#F8F7F4] hover:text-[#0A2342] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2342]"
          >
            {EXTERNAL_ICON}
            Ver sitio
          </Link>
          <LogoutButton />
        </div>

        {/* Botón menú (mobile/tablet) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#D8D8D8] text-[#0A2342] hover:bg-[#F8F7F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2342] lg:hidden"
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Fila 2 (desktop): navegación principal con estado activo */}
      <nav aria-label="Secciones del panel" className="hidden border-t border-[#F0EEE9] lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 lg:px-8">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-10 items-center border-b-2 px-3 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0A2342] ${
                  active
                    ? "border-[#C9A86A] font-bold text-[#0A2342]"
                    : "border-transparent font-medium text-[#4A5568] hover:border-[#D8D8D8] hover:text-[#0A2342]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Menú mobile: mismas secciones + acciones globales, con texto siempre */}
      {open && (
        <nav
          id="admin-mobile-menu"
          aria-label="Menú del panel"
          className="border-t border-[#D8D8D8] bg-white shadow-[0_12px_24px_-12px_rgba(10,35,66,0.25)] lg:hidden"
        >
          <ul className="px-2 py-2">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2.5 text-sm ${
                      active
                        ? "bg-[#F8F7F4] font-bold text-[#0A2342]"
                        : "font-medium text-[#4A5568] hover:bg-[#F8F7F4] hover:text-[#0A2342]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-[#F0EEE9] px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[11px] text-slate-500">{userLabel}</div>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#4A5568] hover:text-[#0A2342]"
              >
                {EXTERNAL_ICON}
                Ver sitio
              </Link>
            </div>
            <LogoutButton />
          </div>
        </nav>
      )}
    </header>
  );
}
