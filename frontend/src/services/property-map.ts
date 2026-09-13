import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { resolvePublicLocation } from "@/lib/geo/public-location";
import { resolveCoverImageUrl } from "@/services/properties";
import type { Property, PropertyOperation, PropertyType } from "@/services/mock-properties";
import type { MapPoint, MapPropertyBase } from "@/lib/map/types";

/**
 * S26-MAP-01 — lectura PUBLICA para el mapa estrategico.
 *
 * INVARIANTE I1 (CORE-GEO-01): el SELECT lista UNICAMENTE columnas
 * publicables. `lat` y `lng` internas NO aparecen, y tampoco `address`:
 * el mapa no necesita el domicilio y lo que no se pide no se filtra.
 *
 * INVARIANTE I2: `resolvePublicLocation` es el unico juez. Modo
 * invalido, `hidden` o centro ausente => la propiedad NO se dibuja.
 *
 * INVARIANTE I4: esa propiedad tampoco desaparece del sitio: vuelve en
 * `withoutLocation` para que la vista la liste igual, con su link y su
 * WhatsApp. El mapa no puede convertirse en un filtro que esconde stock.
 *
 * SIN FALLBACK DE MUESTRA, a diferencia de `getAllProperties`: si
 * Supabase no responde, el mapa queda vacio. Dibujar propiedades de
 * ejemplo sobre un mapa es afirmar que en ese punto hay algo en venta.
 */

const MAP_COLUMNS =
  "id,slug,title,price,currency,per_month,operation_type,property_type," +
  "city,neighborhood,bedrooms,bathrooms,covered_area_m2,badges,cover_image,agency_id," +
  "public_location_mode,public_latitude,public_longitude,public_radius_m";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

interface MapRow {
  id: string;
  slug: string;
  title: string;
  price: number | string | null;
  currency: Property["currency"];
  per_month: boolean | null;
  operation_type: PropertyOperation;
  property_type: PropertyType;
  city: string;
  neighborhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  covered_area_m2: number | string | null;
  badges: string[] | null;
  cover_image: string | null;
  agency_id: string | null;
  public_location_mode: string | null;
  public_latitude: number | string | null;
  public_longitude: number | string | null;
  public_radius_m: number | string | null;
}

export interface MapFilters {
  operationType?: PropertyOperation;
  propertyType?: PropertyType;
  city?: string;
  limit?: number;
}

export interface MapPropertiesResult {
  /** Publicadas con ubicacion publicable: se dibujan. */
  points: MapPoint[];
  /** Publicadas sin ubicacion publicable: se listan, no se dibujan. */
  withoutLocation: MapPropertyBase[];
}

const EMPTY: MapPropertiesResult = { points: [], withoutLocation: [] };

function toNumberOrUndefined(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToBase(row: MapRow): MapPropertyBase {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    price: toNumberOrUndefined(row.price) ?? 0,
    currency: row.currency,
    perMonth: row.per_month ? true : undefined,
    operation: row.operation_type,
    type: row.property_type,
    image: resolveCoverImageUrl(row.cover_image),
    city: row.city,
    neighborhood: row.neighborhood ?? undefined,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    coveredArea: toNumberOrUndefined(row.covered_area_m2),
    badges: row.badges && row.badges.length > 0 ? row.badges : undefined,
    agencyId: row.agency_id ?? undefined,
  };
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/** Propiedades publicadas para el mapa. Nunca lanza. */
export async function getMapProperties(
  filters: MapFilters = {},
): Promise<MapPropertiesResult> {
  if (!isSupabaseConfigured()) {
    log.warn("property-map", "supabase no configurado; mapa vacio");
    return EMPTY;
  }
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("properties")
      .select(MAP_COLUMNS)
      .eq("published", true)
      .order("featured", { ascending: false })
      .order("featured_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(clampLimit(filters.limit));

    if (filters.city) query = query.eq("city", filters.city);
    if (filters.operationType) query = query.eq("operation_type", filters.operationType);
    if (filters.propertyType) query = query.eq("property_type", filters.propertyType);

    const { data, error } = await withTimeout(query, 8000, "properties.map");

    if (error) {
      log.error("property-map", "supabase select error", {
        code: error.code ?? "unknown",
      });
      return EMPTY;
    }

    const rows = ((data as unknown) as MapRow[] | null) ?? [];
    const points: MapPoint[] = [];
    const withoutLocation: MapPropertyBase[] = [];

    for (const row of rows) {
      const base = rowToBase(row);
      const location = resolvePublicLocation(row);
      if (location.kind === "hidden") {
        withoutLocation.push(base);
        continue;
      }
      const anchor = location.kind === "exact" ? location.point : location.center;
      points.push({
        ...base,
        location,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
      });
    }

    return { points, withoutLocation };
  } catch (err) {
    log.error("property-map", "getMapProperties fallo", {
      kind: err instanceof Error ? err.name : "unknown",
    });
    return EMPTY;
  }
}
