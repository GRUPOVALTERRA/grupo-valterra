"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellSizeDegForZoom, clusterByGrid, isCluster } from "@/lib/map/cluster";
import { boundsOf, type MapPoint } from "@/lib/map/types";
import { compactPrice } from "@/lib/map/format";
import { pinBadgeFor, type AgencyBadge, type PinBadge } from "@/lib/map/badge";
import { escapeAction, fullscreenLabel } from "@/lib/map/fullscreen";
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
 * - El estado activo (hover/seleccion) se aplica con un atributo sobre el
 *   elemento existente (`data-active`), NUNCA reconstruyendo el marcador:
 *   Safari iOS cancela el click de un toque si el DOM bajo el dedo cambia
 *   durante el `mouseover` de compatibilidad (control cruzado, M1).
 * - El circulo del modo aproximado se dibuja SOLO en el pin activo. Ocho
 *   circulos simultaneos tapan el mapa y no comunican nada.
 * - La tarjeta es un overlay de React, no un popup de Leaflet: asi
 *   conserva el WaLink, unico emisor de `wa_click`.
 * - Ningun texto libre (titulo, barrio) entra por innerHTML: en los
 *   iconos solo viajan el precio formateado y la insignia de agencia
 *   (URL validada por `pinBadgeFor` + inicial), todo escapado.
 * - El encuadre espera a que el contenedor tenga tamaño: montado oculto
 *   (toggle Lista/Mapa en movil) Leaflet calcula un zoom absurdo con
 *   0x0 px (control cruzado, A1).
 */

const FALLBACK_CENTER: [number, number] = [-27.4692, -58.8306]; // Corrientes Capital
const FALLBACK_ZOOM = 12;
const SHEET_BREAKPOINT_PX = 640;
const CARD_WIDTH_PX = 288;
const CARD_HEIGHT_PX = 360;
const EMPTY_BADGES: Record<string, AgencyBadge> = {};
// S26-MAP-05: iconos del control de pantalla completa (SVG estatico, sin datos de usuario).
const FS_ICON_EXPAND =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const FS_ICON_COMPRESS =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

const PIN_CSS = `
.vt-pin{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;transition:transform .15s;cursor:pointer}
.vt-pin .vt-pill{display:flex;align-items:center;gap:6px;background:#0A2342;color:#FFFFFF;font:600 12px/1 system-ui,sans-serif;padding:4px 10px 4px 4px;border-radius:999px;white-space:nowrap;border:1.5px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(10,35,66,.35)}
.vt-pin .vt-badge{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;overflow:hidden;background:#C9A84C;color:#0A2342;font:700 11px/1 system-ui,sans-serif;box-shadow:0 0 0 1.5px rgba(255,255,255,.9)}
.vt-pin .vt-badge img{display:block;width:22px;height:22px;object-fit:cover;border-radius:999px}
.vt-pin .vt-dot{width:8px;height:8px;margin-top:-2px;border-radius:999px;background:#0A2342;border:1.5px solid #fff}
.vt-pin[data-active="1"]{transform:translate(-50%,-100%) scale(1.08)}
.vt-pin[data-active="1"] .vt-pill{background:#C9A84C;color:#0A2342}
.vt-pin[data-active="1"] .vt-badge{background:#0A2342;color:#FFFFFF}
.vt-pin[data-active="1"] .vt-dot{background:#C9A84C}
.vt-cluster{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#0A2342;color:#fff;font:700 13px/1 system-ui,sans-serif;border:2px solid #C9A84C;box-shadow:0 2px 10px rgba(10,35,66,.4);cursor:pointer}
.vt-fs button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:0;background:#fff;color:#0A2342;cursor:pointer}
.vt-fs button:hover{background:#f4f4f4}
`;

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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function priceIcon(label: string, badge: PinBadge): L.DivIcon {
  // Insignia: logo validado (pinBadgeFor) o inicial. Ambos escapados.
  const insignia = badge.src
    ? `<img src="${escapeHtml(badge.src)}" alt="" width="22" height="22">`
    : escapeHtml(badge.initial);
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html:
      `<div class="vt-pin" data-active="0">` +
      `<span class="vt-pill"><span class="vt-badge">${insignia}</span>` +
      `<span>${escapeHtml(label)}</span></span>` +
      `<span class="vt-dot"></span></div>`,
  });
}

function clusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="vt-cluster">${escapeHtml(String(count))}</div>`,
  });
}

function setActive(marker: L.Marker, active: boolean): void {
  const root = marker.getElement()?.firstElementChild;
  if (root) root.setAttribute("data-active", active ? "1" : "0");
  marker.setZIndexOffset(active ? 600 : 0);
}

export default function PropertiesMap({
  points,
  whatsappByAgency,
  badgesByAgency = EMPTY_BADGES,
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
  const activeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const selectedRef = useRef(selectedId);
  const hoveredRef = useRef(hoveredId);

  const [zoom, setZoom] = useState(FALLBACK_ZOOM);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const fsButtonRef = useRef<HTMLButtonElement | null>(null);

  const sizeReady = size.w > 0 && size.h > 0;

  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
    selectedRef.current = selectedId;
    hoveredRef.current = hoveredId;
  }, [onSelect, onHover, selectedId, hoveredId]);

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

    activeLayerRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);

    // S26-MAP-05: control "pantalla completa" bajo el zoom. Es un boton
    // nuestro dentro de una barra de Leaflet; el click no debe llegar al
    // mapa (cerraria la tarjeta) ni iniciar un arrastre.
    const FullscreenControl = L.Control.extend({
      onAdd() {
        const bar = L.DomUtil.create("div", "leaflet-bar vt-fs");
        const btn = L.DomUtil.create("button", "", bar) as HTMLButtonElement;
        btn.type = "button";
        btn.innerHTML = FS_ICON_EXPAND;
        btn.setAttribute("aria-label", fullscreenLabel(false));
        btn.setAttribute("title", fullscreenLabel(false));
        btn.setAttribute("aria-pressed", "false");
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stop(e);
          setFullscreen((v) => !v);
        });
        fsButtonRef.current = btn;
        return bar;
      },
      onRemove() {
        fsButtonRef.current = null;
      },
    });
    new FullscreenControl({ position: "topleft" }).addTo(map);

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
      activeLayerRef.current = null;
      markersRef.current = new Map();
    };
  }, [scrollWheelZoom]);

  /* -------- pantalla completa (S26-MAP-05) -------- */
  useEffect(() => {
    fullscreenRef.current = fullscreen;
    const btn = fsButtonRef.current;
    if (btn) {
      btn.innerHTML = fullscreen ? FS_ICON_COMPRESS : FS_ICON_EXPAND;
      btn.setAttribute("aria-label", fullscreenLabel(fullscreen));
      btn.setAttribute("title", fullscreenLabel(fullscreen));
      btn.setAttribute("aria-pressed", fullscreen ? "true" : "false");
    }
    const map = mapRef.current;
    if (map) {
      // A pantalla completa el mapa ES la pagina: la rueda hace zoom. Al
      // volver se respeta lo que pidio la superficie (solo /mapa la usa).
      if (fullscreen || scrollWheelZoom) map.scrollWheelZoom.enable();
      else map.scrollWheelZoom.disable();
      // El ResizeObserver tambien lo hace; esto cubre el primer frame.
      requestAnimationFrame(() => map.invalidateSize());
    }
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen, scrollWheelZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Con tarjeta abierta la cierra su propio listener; recien el
      // siguiente Escape sale de pantalla completa (lib/map/fullscreen).
      if (escapeAction({ fullscreen: fullscreenRef.current, hasSelection: selectedRef.current !== null }) === "exit-fullscreen") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  /* -------- encuadre: derivado de los puntos, y solo con tamaño real -------- */
  const boundsKey = useMemo(() => points.map((p) => p.id).join("|"), [points]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sizeReady) return;
    const b = boundsOf(points);
    if (!b) {
      map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
      return;
    }
    map.fitBounds(
      L.latLngBounds([b.south, b.west], [b.north, b.east]),
      { padding: [48, 48], maxZoom: 15 },
    );
    // `points` cambia de identidad en cada render del padre; boundsKey es la
    // identidad real del conjunto y evita re-encuadrar mientras el usuario
    // navega. `sizeReady` re-encuadra cuando el contenedor pasa de oculto
    // a visible (movil).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, sizeReady]);

  /* -------- pines y clusters (NO se reconstruyen por hover/seleccion) -------- */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const registry = new Map<string, L.Marker>();
    const groups = clusterByGrid(points, cellSizeDegForZoom(zoom));

    for (const group of groups) {
      if (isCluster(group)) {
        const marker = L.marker([group.latitude, group.longitude], {
          icon: clusterIcon(group.items.length),
          keyboard: true,
          title: `${group.items.length} propiedades en esta zona`,
        });
        const acercar = () => {
          map.flyTo([group.latitude, group.longitude], Math.min(map.getZoom() + 2, 18));
        };
        marker.on("click", acercar);
        marker.on("keydown", (e) => {
          const key = (e as L.LeafletKeyboardEvent).originalEvent.key;
          if (key === "Enter" || key === " ") {
            (e as L.LeafletKeyboardEvent).originalEvent.preventDefault();
            acercar();
          }
        });
        marker.addTo(layer);
        continue;
      }

      const p = group.items[0];
      const badge = pinBadgeFor(p.agencyId ? badgesByAgency[p.agencyId] : null);
      const marker = L.marker([p.latitude, p.longitude], {
        icon: priceIcon(compactPrice(p.price, p.currency), badge),
        keyboard: true,
        title: p.title,
        alt: p.title,
      });
      marker.on("click", () => onSelectRef.current(p.id));
      marker.on("keydown", (e) => {
        const key = (e as L.LeafletKeyboardEvent).originalEvent.key;
        if (key === "Enter" || key === " ") {
          (e as L.LeafletKeyboardEvent).originalEvent.preventDefault();
          onSelectRef.current(p.id);
        }
      });
      marker.on("mouseover", () => onHoverRef.current?.(p.id));
      marker.on("mouseout", () => onHoverRef.current?.(null));
      marker.addTo(layer);
      registry.set(p.id, marker);
      // Un pin recien construido hereda el estado activo vigente.
      setActive(marker, p.id === selectedRef.current || p.id === hoveredRef.current);
    }
    markersRef.current = registry;
  }, [points, zoom, badgesByAgency]);

  /* -------- estado activo: atributo sobre el pin existente + circulo -------- */
  useEffect(() => {
    const activeLayer = activeLayerRef.current;
    if (!activeLayer) return;

    for (const [id, marker] of markersRef.current) {
      setActive(marker, id === selectedId || id === hoveredId);
    }

    activeLayer.clearLayers();
    const focoId = selectedId ?? hoveredId;
    const foco = focoId ? points.find((p) => p.id === focoId) : undefined;
    if (foco && foco.location.kind === "approximate") {
      L.circle([foco.latitude, foco.longitude], {
        radius: foco.location.radiusM,
        color: "#C9A84C",
        fillColor: "#C9A84C",
        fillOpacity: 0.15,
        weight: 2,
        interactive: false, // el click dentro del radio no debe cerrar la tarjeta
      }).addTo(activeLayer);
    }
  }, [selectedId, hoveredId, points, zoom]);

  /* -------- seleccion: paneo si quedo afuera + posicion de la tarjeta -------- */
  const selected = useMemo(
    () => points.find((p) => p.id === selectedId) ?? null,
    [points, selectedId],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected || !sizeReady) {
      setCardPos(null);
      return;
    }
    const ll = L.latLng(selected.latitude, selected.longitude);
    if (!map.getBounds().contains(ll)) map.panTo(ll);

    const update = () => {
      const pt = map.latLngToContainerPoint(ll);
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
  }, [selected, sizeReady]);

  const sheet = sizeReady && size.w < SHEET_BREAKPOINT_PX;

  let anchored: { left: number; top: number; transform: string } | null = null;
  if (selected && cardPos && sizeReady && !sheet) {
    const half = CARD_WIDTH_PX / 2;
    const maxX = Math.max(size.w - half - 8, half + 8);
    const left = Math.min(Math.max(cardPos.x, half + 8), maxX);
    const above = cardPos.y > CARD_HEIGHT_PX + 24;
    const top = above
      ? cardPos.y - 16
      : Math.min(cardPos.y + 16, Math.max(8, size.h - CARD_HEIGHT_PX - 8));
    anchored = {
      left,
      top,
      transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
    };
  }

  const hayAproximadas = points.some((p) => p.location.kind === "approximate");

  return (
    <div
      data-map-fullscreen={fullscreen ? "1" : "0"}
      className={fullscreen ? "fixed inset-0 z-[1400] bg-white" : `relative ${className ?? ""}`}
    >
      <style>{PIN_CSS}</style>
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
