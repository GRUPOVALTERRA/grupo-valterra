"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@/lib/geo/types";

/**
 * S18 PR2 — GeoMapPicker (candidato reutilizable, NO extraído aún).
 *
 * Leaflet puro + tiles OpenStreetMap (sin API key). La atribución OSM es
 * obligatoria por la política del proveedor y NUNCA se oculta.
 *
 * Importar SIEMPRE con next/dynamic ssr:false (Leaflet no funciona en SSR).
 *
 * Regla dura: el centro visual del mapa NO es una coordenada persistida.
 * Este componente solo emite onChange ante una acción del operador
 * (click o drag del pin). Centrar el mapa en el fallback regional no
 * dispara onChange jamás.
 */

export interface GeoMapPickerProps {
  /** Punto seleccionado (pin). null = sin selección. */
  value: GeoPoint | null;
  /** Emitido SOLO por click en el mapa o drag del pin. */
  onChange?: (point: GeoPoint) => void;
  /** Radio en metros para dibujar un círculo alrededor del punto. */
  circleRadiusM?: number;
  /** Centro visual inicial cuando value es null (UX; no se persiste). */
  fallbackCenter: GeoPoint;
  /** false = solo visualización (preview). */
  interactive?: boolean;
  heightPx?: number;
}

/** Pin dorado Valterra (divIcon: sin assets externos que rompan el bundler). */
function goldPin(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z" fill="#C9A84C" stroke="#0D1F3C" stroke-width="1.5"/><circle cx="15" cy="15" r="5.5" fill="#0D1F3C"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function GeoMapPicker({
  value,
  onChange,
  circleRadiusM,
  fallbackCenter,
  interactive = true,
  heightPx = 288,
}: GeoMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Creación única del mapa.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = value ?? fallbackCenter;
    const map = L.map(containerRef.current, {
      center: [center.latitude, center.longitude],
      zoom: value ? 15 : 12,
      scrollWheelZoom: interactive,
      dragging: interactive,
      attributionControl: true, // atribución OSM obligatoria: no ocultar
    });
    // OSM sin API key. El host debe estar en img-src de la CSP
    // (next.config.ts) o el navegador bloquea los tiles.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    if (interactive) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        onChangeRef.current?.({ latitude: round6(e.latlng.lat), longitude: round6(e.latlng.lng) });
      });
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo montaje
  }, []);

  // Sincronizar pin + círculo con el valor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      circleRef.current?.remove();
      circleRef.current = null;
      return;
    }

    const latlng: L.LatLngTuple = [value.latitude, value.longitude];
    if (!markerRef.current) {
      const marker = L.marker(latlng, { icon: goldPin(), draggable: interactive });
      if (interactive) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onChangeRef.current?.({ latitude: round6(p.lat), longitude: round6(p.lng) });
        });
      }
      marker.addTo(map);
      markerRef.current = marker;
      map.setView(latlng, Math.max(map.getZoom(), 15));
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (circleRadiusM && circleRadiusM > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: circleRadiusM,
          color: "#C9A84C",
          fillColor: "#C9A84C",
          fillOpacity: 0.18,
          weight: 2,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(circleRadiusM);
      }
    } else {
      circleRef.current?.remove();
      circleRef.current = null;
    }
  }, [value, circleRadiusM, interactive]);

  return (
    <div
      ref={containerRef}
      style={{ height: heightPx }}
      className="w-full overflow-hidden rounded-lg border border-[#D8D8D8]"
      aria-label="Mapa de ubicación"
    />
  );
}
