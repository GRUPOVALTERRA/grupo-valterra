"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicLocation } from "@/lib/geo/types";

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
}

function goldPin(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: '<svg width="34" height="46" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z" fill="#C9A84C" stroke="#0D1F3C" stroke-width="1.5"/><circle cx="15" cy="15" r="5.5" fill="#0D1F3C"/></svg>',
    iconSize: [34, 46],
    iconAnchor: [17, 46],
  });
}

export default function PropertyPublicMap({ location, heightPx = 320 }: Props) {
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
      L.marker([point.latitude, point.longitude], { icon: goldPin() }).addTo(map);
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
  }, [location]);

  return (
    <div
      ref={containerRef}
      style={{ height: heightPx }}
      className="w-full overflow-hidden rounded-2xl border border-[#D8D8D8]"
      aria-label="Mapa de ubicación de la propiedad"
    />
  );
}
