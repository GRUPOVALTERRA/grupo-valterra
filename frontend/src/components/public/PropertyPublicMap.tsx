"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicLocation } from "@/lib/geo/types";
import type { PinBadge } from "@/lib/map/badge";

/**
 * S18 PR3 — mapa público de la ficha de propiedad.
 *
 * Contrato duro: recibe SOLO un `PublicLocation` ya resuelto por
 * CORE-GEO-01. No conoce `lat`/`lng` internos, no acepta coordenadas
 * sueltas y no decide visibilidad: si el modo es `hidden` la sección
 * ni siquiera se renderiza (lo decide el server component).
 *
 * Tiles: OpenStreetMap vía Leaflet, sin API key (baseline aprobado).
 * La atribución OSM es obligatoria y siempre visible.
 *
 * Nota: los tiles requieren que el host esté en `img-src` de la CSP
 * (next.config.ts). Sin eso el navegador bloquea las imágenes y el
 * mapa se ve gris — fue la causa de los 503 diagnosticados en PR3.
 */

interface Props {
  location: Exclude<PublicLocation, { kind: "hidden" }>;
  heightPx?: number;
  /** Insignia de la agencia dueña (S26-MAP-04), ya validada por pinBadgeFor. */
  badge?: PinBadge | null;
}

const PIN_SVG =
  '<svg width="34" height="46" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z" fill="#C9A84C" stroke="#0D1F3C" stroke-width="1.5"/><circle cx="15" cy="15" r="5.5" fill="#0D1F3C"/></svg>';

/* S26-MAP-04: la insignia va centrada en la cabeza del alfiler (centro 17,17 · radio 17). */
const FICHA_PIN_CSS = `
.vt-fpin{position:relative;width:34px;height:46px}
.vt-fpin svg{display:block}
.vt-fpin-badge{position:absolute;left:7px;top:7px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;overflow:hidden;background:#0A2342;color:#fff;font:700 10px/1 system-ui,sans-serif;box-shadow:0 0 0 1.5px rgba(255,255,255,.9)}
.vt-fpin-badge img{display:block;width:20px;height:20px;object-fit:cover}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Alfiler dorado; con la insignia de la agencia si la hay (S26-MAP-04). Todo escapado: es innerHTML. */
function goldPin(badge: PinBadge | null): L.DivIcon {
  const insignia = badge
    ? `<span class="vt-fpin-badge">${
        badge.src
          ? `<img src="${escapeHtml(badge.src)}" alt="" width="20" height="20">`
          : escapeHtml(badge.initial)
      }</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div class="vt-fpin">${PIN_SVG}${insignia}</div>`,
    iconSize: [34, 46],
    iconAnchor: [17, 46],
  });
}

export default function PropertyPublicMap({ location, heightPx = 320, badge = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const point = location.kind === "exact" ? location.point : location.center;
    const zoom = location.kind === "exact" ? 16 : 14;

    const map = L.map(containerRef.current, {
      center: [point.latitude, point.longitude],
      zoom,
      scrollWheelZoom: false, // no secuestrar el scroll de la ficha
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    if (location.kind === "exact") {
      L.marker([point.latitude, point.longitude], { icon: goldPin(badge) }).addTo(map);
    } else {
      L.circle([point.latitude, point.longitude], {
        radius: location.radiusM,
        color: "#C9A84C",
        fillColor: "#C9A84C",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(map);
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [location, badge]);

  return (
    <>
      <style>{FICHA_PIN_CSS}</style>
      <div
        ref={containerRef}
        style={{ height: heightPx }}
        className="w-full overflow-hidden rounded-2xl border border-[#D8D8D8]"
        aria-label="Mapa de ubicación de la propiedad"
      />
    </>
  );
}
