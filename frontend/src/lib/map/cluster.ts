/**
 * S26-MAP-01 — agrupamiento de pines por grilla. Modulo PURO.
 *
 * Sin Leaflet, sin React, sin red: aritmetica testeable.
 *
 * POR QUE PROPIO Y NO `leaflet.markercluster`:
 *   con 10-50 publicaciones el problema real es que dos pines del mismo
 *   barrio se pisen. Eso lo resuelven estas 60 lineas. Sumar una
 *   dependencia con CSS propio para eso agrega superficie de build y de
 *   licencia sin beneficio. Si el catalogo pasa las ~500 publicaciones,
 *   se reevalua con numeros, no con intuicion.
 */

export interface ClusterableItem {
  id: string;
  latitude: number;
  longitude: number;
}

export interface Cluster<T extends ClusterableItem> {
  /** Clave estable de la celda ("fila:columna"). Sirve de key de React. */
  key: string;
  /** Centroide de los miembros: donde se dibuja el globo. */
  latitude: number;
  longitude: number;
  items: T[];
}

/** Lado objetivo de la celda, en pixeles de pantalla. */
export const TARGET_CELL_PX = 72;

/** Lado del tile de Web Mercator. */
const TILE_SIZE_PX = 256;

/**
 * Grados de longitud que ocupa una celda de `targetPx` pixeles al zoom
 * dado. Se usa el mismo valor para latitud: en la latitud del NEA
 * (~-27) la diferencia con la proyeccion real es de ~11 %, invisible
 * para decidir si dos pines se pisan, y evita meter Mercator en un
 * modulo que se testea con una calculadora.
 */
export function cellSizeDegForZoom(zoom: number, targetPx: number = TARGET_CELL_PX): number {
  if (!Number.isFinite(zoom) || zoom < 0) return 0;
  if (!Number.isFinite(targetPx) || targetPx <= 0) return 0;
  const worldPx = TILE_SIZE_PX * Math.pow(2, zoom);
  return (targetPx * 360) / worldPx;
}

function centroid<T extends ClusterableItem>(items: readonly T[]): {
  latitude: number;
  longitude: number;
} {
  // Con un solo miembro el promedio es el punto mismo: un pin solitario
  // se dibuja EXACTAMENTE donde corresponde, nunca corrido al centro de
  // su celda.
  let lat = 0;
  let lng = 0;
  for (const it of items) {
    lat += it.latitude;
    lng += it.longitude;
  }
  return { latitude: lat / items.length, longitude: lng / items.length };
}

/**
 * Agrupa por celdas de `cellSizeDeg` grados de lado.
 *
 * Fail-open deliberado: si el tamaño de celda no es utilizable, NO se
 * agrupa y se devuelve un grupo por item. Un pin de mas es un problema
 * estetico; un globo que esconde stock es un problema comercial.
 *
 * Los items con coordenadas no finitas se descartan: no existe un lugar
 * honesto donde dibujarlos.
 */
export function clusterByGrid<T extends ClusterableItem>(
  items: readonly T[],
  cellSizeDeg: number,
): Cluster<T>[] {
  if (!items || items.length === 0) return [];

  const usable = items.filter(
    (it) => Number.isFinite(it.latitude) && Number.isFinite(it.longitude),
  );
  if (usable.length === 0) return [];

  if (!Number.isFinite(cellSizeDeg) || cellSizeDeg <= 0) {
    return usable.map((it) => ({
      key: it.id,
      latitude: it.latitude,
      longitude: it.longitude,
      items: [it],
    }));
  }

  const cells = new Map<string, T[]>();
  for (const it of usable) {
    const row = Math.floor(it.latitude / cellSizeDeg);
    const col = Math.floor(it.longitude / cellSizeDeg);
    const key = `${row}:${col}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(it);
    else cells.set(key, [it]);
  }

  const out: Cluster<T>[] = [];
  for (const [key, group] of cells) {
    out.push({ key, ...centroid(group), items: group });
  }
  // Orden determinista: dos corridas con la misma entrada dan el mismo
  // resultado (tests estables y reconciliacion de React previsible).
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/** true si el grupo debe dibujarse como globo con conteo. */
export function isCluster<T extends ClusterableItem>(c: Cluster<T>): boolean {
  return c.items.length > 1;
}
