"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellSizeDegForZoom, clusterByGrid, isCluster } from "@/lib/map/cluster";
import { boundsOf, type MapPoint } from "@/lib/map/types";
import { compactPrice } from "@/lib/map/format";
import { pinBadgeFor, type AgencyBadge, type PinBadge } from "@/lib/map/badge";
import { MapPropertyCard } from "@/components/public/MapPropertyCard";

/**
 * S26-MAP-01 — mapa estrategico de propiedades.
 *
 * Recibe SOLO puntos ya resueltos por CORE-GEO-01 (`MapPoint`, cuyo tipo
 * excluye `hidden` por construccion). No conoce `lat`/`lng` internos, no
 * consulta la base y no decide que se publica: eso ya se decidio antes
 * de llegar acá.
 *
 * Tiles: OpenStreetMap sin API key, igual que la ficha. El host ya esta
 * habilitado en `img-src` de la CSP (next.config.ts): sin eso el mapa se
 * ve gris.
 *
 * DECISIONES DE DIBUJO
 * - Pastilla de precio en lugar de alfiler generico: el precio es el dato
 *   que decide si alguien hace click.
 * - El circulo del modo aproximado se dibuja SOLO en el pin activo. Ocho
 *   circulos simultaneos tapan el mapa y no comunican nada.
 * - La tarjeta es un overlay de React, no un popup de Leaflet: asi
 *   conserva el WaLink, unico emisor de `wa_click`.
 * - Ningun texto libre (titulo, barrio) entra por innerHTML: en los
 *   iconos solo viajan el precio formateado y la insignia de agencia
 *   (URL validada por `pinBadgeFor` + inicial), todo escapado.
 */

const FALLBACK_CENTER: [number, number] = [-27.4692, -58.8306]; // Corrientes Capital
const FALLBACK_ZOOM = 12;
const SHEET_BREAKPOINT_PX = 640;
const CARD_WIDTH_PX = 288;
const CARD_HEIGHT_PX = 360;
const GOLD = "#C9A84C";
const NAVY = "#0A2342";

interface Props {
  points: MapPoint[];
  /** agencyId → WhatsApp (digitos wa.me). */
  whatsappByAgency: Record<string, string>;
  /** agencyId → nombre + logo miniatura (S26-MAP-02). */
  badgesByAgency?: Record<string, AgencyBadge>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
  /** Solo la pantalla completa (/mapa) secuestra la rueda del mouse. */
  scrollWheelZoom?: boolean;
  className?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function priceIcon(label: string, active: boolean, badge: PinBadge): L.DivIcon {
  const bg = active ? GOLD : NAVY;
  const fg = active ? NAVY : "#FFFFFF";
  const badgeBg = active ? NAVY : GOLD;
  const badgeFg = active ? "#FFFFFF" : NAVY;
  const scale = active ? 1.08 : 1;
  // Insignia: logo validado (pinBadgeFor) o inicial. Ambos escapados.
  const insignia = badge.src
    ? `<img src="${escapeHtml(badge.src)}" alt="" width="22" height="22" ` +
      `style="display:block;width:22px;height:22px;object-fit:cover;border-radius:999px">`
    : escapeHtml(badge.initial);
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html:
      `<div style="position:absolute;transform:translate(-50%,-100%) scale(${scale});` +
      `display:flex;flex-direction:column;align-items:center;transition:transform .15s">` +
      `<span style="display:flex;align-items:center;gap:6px;background:${bg};color:${fg};` +
      `font:600 12px/1 system-ui,sans-serif;padding:4px 10px 4px 4px;border-radius:999px;` +
      `white-space:nowrap;border:1.5px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(10,35,66,.35)">` +
      `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;` +
      `border-radius:999px;overflow:hidden;background:${badgeBg};color:${badgeFg};font:700 11px/1 system-ui,sans-serif">` +
      `${insignia}</span>` +
      `<span>${escapeHtml(label)}</span></span>` +
      `<span style="width:8px;height:8px;margin-top:-2px;border-radius:999px;` +
      `background:${bg};border:1.5px solid #fff"></span></div>`,
  });
}

function clusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html:
      `<div style="position:absolute;transform:translate(-50%,-50%);` +
      `display:flex;align-items:center;justify-content:center;width:40px;height:40px;` +
      `border-radius:999px;background:${NAVY};color:#fff;font:700 13px/1 system-ui,sans-serif;` +
      `border:2px solid ${GOLD};box-shadow:0 2px 10px rgba(10,35,66,.4)">` +
      `${escapeHtml(String(count))}</div>`,
  });
}

export default function PropertiesMap({
  points,
  whatsappByAgency,
  badgesByAgency = {},
  selectedId,
  onSelect,
  hoveredId = null,
  onHover,
  scrollWheelZoom = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);

  const [zoom, setZoom] = useState(FALLBACK_ZOOM);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  }, [onSelect, onHover]);

  /* -------- init -------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      scrollWheelZoom,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);

    const syncZoom = () => setZoom(map.getZoom());
    const clearSelection = () => onSelectRef.current(null);
    map.on("zoomend", syncZoom);
    map.on("click", clearSelection);

    mapRef.current = map;
    setZoom(map.getZoom());

    return () => {
      map.off("zoomend", syncZoom);
      map.off("click", clearSelection);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [scrollWheelZoom]);

  /* -------- tamaño del contenedor (sheet vs anclada + invalidateSize) -------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: r.width, h: r.height });
      // El toggle Lista/Mapa monta el mapa oculto: sin esto queda gris.
      mapRef.current?.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* -------- encuadre: siempre derivado de los puntos, nunca fijo -------- */
  const boundsKey = useMemo(() => points.map((p) => p.id).join("|"), [points]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = boundsOf(points);
    if (!b) {
      map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
      return;
    }
    map.fitBounds(
      L.latLngBounds([b.south, b.west], [b.north, b.east]),
      { padding: [48, 48], maxZoom: 15 },
    );
    // points se recalcula en cada render del padre; boundsKey es la
    // identidad real del conjunto y evita re-encuadrar mientras el
    // usuario navega el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  /* -------- pines y clusters -------- */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const groups = clusterByGrid(points, cellSizeDegForZoom(zoom));

    for (const group of groups) {
      if (isCluster(group)) {
        const marker = L.marker([group.latitude, group.longitude], {
          icon: clusterIcon(group.items.length),
          keyboard: true,
          title: `${group.items.length} propiedades en esta zona`,
        });
        marker.on("click", () => {
          map.flyTo([group.latitude, group.longitude], Math.min(map.getZoom() + 2, 18));
        });
        marker.addTo(layer);
        continue;
      }

      const p = group.items[0];
      const active = p.id === selectedId || p.id === hoveredId;

      if (active && p.location.kind === "approximate") {
        L.circle([p.latitude, p.longitude], {
          radius: p.location.radiusM,
          color: GOLD,
          fillColor: GOLD,
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(layer);
      }

      const badge = pinBadgeFor(p.agencyId ? badgesByAgency[p.agencyId] : null);
      const marker = L.marker([p.latitude, p.longitude], {
        icon: priceIcon(compactPrice(p.price, p.currency), active, badge),
        keyboard: true,
        title: p.title,
        alt: p.title,
        zIndexOffset: active ? 600 : 0,
      });
      marker.on("click", () => onSelectRef.current(p.id));
      marker.on("mouseover", () => onHoverRef.current?.(p.id));
      marker.on("mouseout", () => onHoverRef.current?.(null));
      marker.addTo(layer);
    }
  }, [points, zoom, selectedId, hoveredId, badgesByAgency]);

  /* -------- posicion de la tarjeta -------- */
  const selected = useMemo(
    () => points.find((p) => p.id === selectedId) ?? null,
    [points, selectedId],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) {
      setCardPos(null);
      return;
    }
    const update = () => {
      const pt = map.latLngToContainerPoint([selected.latitude, selected.longitude]);
      setCardPos({ x: pt.x, y: pt.y });
    };
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
    };
  }, [selected]);

  const sheet = size.w > 0 && size.w < SHEET_BREAKPOINT_PX;

  let anchored: { left: number; top: number; transform: string } | null = null;
  if (selected && cardPos && !sheet) {
    const half = CARD_WIDTH_PX / 2;
    const maxX = Math.max(size.w - half - 8, half + 8);
    const left = Math.min(Math.max(cardPos.x, half + 8), maxX);
    const above = cardPos.y > CARD_HEIGHT_PX + 24;
    anchored = {
      left,
      top: above ? cardPos.y - 16 : cardPos.y + 16,
      transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
    };
  }

  const hayAproximadas = points.some((p) => p.location.kind === "approximate");

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" aria-label="Mapa de propiedades" />

      {selected && sheet && (
        <div className="absolute inset-x-3 bottom-3 z-[1100]">
          <MapPropertyCard
            property={selected}
            whatsapp={selected.agencyId ? whatsappByAgency[selected.agencyId] : undefined}
            badge={selected.agencyId ? badgesByAgency[selected.agencyId] : undefined}
            onClose={() => onSelect(null)}
          />
        </div>
      )}

      {selected && !sheet && anchored && (
        <div className="absolute z-[1100] w-72" style={anchored}>
          <MapPropertyCard
            property={selected}
            whatsapp={selected.agencyId ? whatsappByAgency[selected.agencyId] : undefined}
            badge={selected.agencyId ? badgesByAgency[selected.agencyId] : undefined}
            onClose={() => onSelect(null)}
          />
        </div>
      )}

      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center p-6">
          <p className="rounded-xl bg-white/95 px-4 py-3 text-center text-sm text-slate-600 shadow">
            No hay propiedades con ubicación publicada para estos filtros.
          </p>
        </div>
      )}

      {hayAproximadas && (
        <p className="pointer-events-none absolute bottom-2 left-2 z-[900] rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500">
          El círculo indica una zona aproximada, no el domicilio exacto.
        </p>
      )}
    </div>
  );
}
