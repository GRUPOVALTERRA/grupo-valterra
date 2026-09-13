/**
 * S26-MAP-03 — regla de visibilidad del boton flotante "Mapa". Modulo PURO.
 *
 * Separada del componente para testearla sin Next ni React. Misma regla
 * de "admin" que la analitica (isAdminPath), asi las dos capas no
 * discrepan.
 */

import { isAdminPath } from "@/lib/events";

export function shouldShowMapFab(pathname: string | null, vista: string | null): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  if (isAdminPath(pathname)) return false;
  // Flujos de acceso: nada comercial en una pantalla de login.
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return false;
  // Ya estas en el mapa; en movil el boton fijo taparia la tarjeta.
  if (pathname === "/mapa" || pathname.startsWith("/mapa/")) return false;
  if (pathname === "/propiedades" && vista === "mapa") return false;
  return true;
}
