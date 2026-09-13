"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { shouldShowMapFab } from "@/lib/map/fab";

/**
 * S26-MAP-03 — boton flotante "Mapa" (decision del titular, 13/09/2026:
 * "el mapa es la estrella del lugar, debe aparecer como boton flotante en
 * la esquina inferior derecha todo el tiempo").
 *
 * Vive en el layout raiz, asi que decide por si mismo donde NO mostrarse:
 *   - panel de administracion (isAdminPath: misma regla que la analitica);
 *   - flujos de acceso (/auth/*): nada comercial en una pantalla de login;
 *   - la propia /mapa, y /propiedades?vista=mapa: ya estas en el mapa, y
 *     en movil el boton fijo taparia la tarjeta de la propiedad.
 *
 * Es un <Link>, no un <button>: navega, no dispara nada. La visita a /mapa
 * ya la registra el PageviewTracker; no hace falta un evento nuevo (la
 * allowlist de tipos es cerrada a proposito).
 */

export function MapFab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!shouldShowMapFab(pathname, searchParams?.get("vista") ?? null)) return null;

  return (
    <Link
      href="/mapa"
      aria-label="Ver el mapa de propiedades"
      className="fixed right-5 z-[1300] inline-flex items-center gap-2 rounded-full bg-[#0A2342] py-3 pl-3.5 pr-5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(10,35,66,0.55)] ring-2 ring-[#C9A86A]/80 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A86A]"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C9A86A] text-[#0A2342]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 21s-6-5.6-6-11a6 6 0 0112 0c0 5.4-6 11-6 11z" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      </span>
      Mapa
    </Link>
  );
}
