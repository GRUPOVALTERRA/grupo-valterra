"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAdminPath } from "@/lib/events";
import { trackSiteEvent } from "./trackSiteEvent";

/**
 * VALTERRA DATA & ANALYTICS — pageviews propios (S20-PR2).
 *
 * Montado una sola vez en el layout raíz. Registra la primera carga y cada
 * navegación del App Router, que no dispara un page load real: sin esto,
 * toda la navegación interna sería invisible y el tablero mostraría solo
 * las entradas directas.
 *
 * NO instrumenta /admin (ver `shouldTrackPageview`). Convive con Vercel
 * Analytics, que sigue montado en el layout y no se toca.
 */

/** Última ruta registrada. Fuera del componente a propósito: ver abajo. */
let lastTrackedPath: string | null = null;

/**
 * ¿Corresponde emitir un pageview para esta ruta?
 *
 * Función pura para poder probarla sin renderizar. Dos reglas:
 *
 * 1. EL ADMIN NUNCA. El panel es trabajo interno, no tráfico comercial;
 *    contarlo inflaría las métricas con nuestras propias sesiones. La regla
 *    vive además en el endpoint y en un check de la base: tres capas.
 *
 * 2. NO REPETIR LA MISMA RUTA. React StrictMode monta, desmonta y vuelve a
 *    montar cada efecto en desarrollo, y un re-render por cambio de estado
 *    puede reejecutarlo. Sin este guard, una sola visita generaría dos o
 *    tres filas y todas las métricas quedarían infladas de forma invisible.
 */
export function shouldTrackPageview(lastPath: string | null, nextPath: string): boolean {
  if (!nextPath || !nextPath.startsWith("/")) return false;
  if (isAdminPath(nextPath)) return false;
  return lastPath !== nextPath;
}

/** Solo para tests: reinicia la memoria de deduplicación. */
export function __resetPageviewTracker(): void {
  lastTrackedPath = null;
}

export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (!shouldTrackPageview(lastTrackedPath, pathname)) return;

    // Se marca ANTES de emitir: si el efecto se reejecuta mientras el fetch
    // está en vuelo, la segunda pasada ya ve la ruta como registrada.
    lastTrackedPath = pathname;
    trackSiteEvent("pageview");
  }, [pathname]);

  return null;
}
