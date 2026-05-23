import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { MOCK_PROPERTIES, type Property, type PropertyOperation, type PropertyType } from "./mock-properties";

/**
 * Service properties - patron hybrid Supabase + fallback memoria.
 *
 * Espejo arquitectonico de mock-leads.ts:
 *   - si Supabase esta configurado -> query real con filtros server-side
 *   - si no, o si la tabla esta vacia, o si hay error -> fallback memoria
 *     usando MOCK_PROPERTIES como source-of-truth UI
 *
 * Contrato externo intacto: el resto del frontend sigue consumiendo
 * el type Property (camelCase) sin enterarse de la capa DB.
 */

/* ---------- DB row (snake_case - debe matchear migracion 0002) ---------- */

interface PropertyRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number | string;
  currency: "USD" | "ARS";
  per_month: boolean;
  operation_type: PropertyOperation;
  property_type: PropertyType;
  city: string;
  neighborhood: string | null;
  province: string;
  country: string;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  covered_area_m2: number | string | null;
  total_area_m2: number | string | null;
  badges: string[] | null;
  cover_image: string | null;
  gallery: string[] | null;
  agent_name: string | null;
  agent_phone: string | null;
  agency_id: string | null;
  published: boolean;
  featured: boolean;
  featured_order: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id,slug,title,description,price,currency,per_month,operation_type,property_type," +
  "city,neighborhood,province,country,address,lat,lng," +
  "bedrooms,bathrooms,parking,covered_area_m2,total_area_m2," +
  "badges,cover_image,gallery,agent_name,agent_phone,agency_id," +
  "published,featured,featured_order,created_at,updated_at";

function toNumberOrUndefined(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    city: row.city,
    neighborhood: row.neighborhood ?? undefined,
    province: row.province,
    price: toNumberOrUndefined(row.price) ?? 0,
    currency: row.currency,
    perMonth: row.per_month ? true : undefined,
    operation: row.operation_type,
    type: row.property_type,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    parking: row.parking ?? undefined,
    coveredArea: toNumberOrUndefined(row.covered_area_m2),
    totalArea: toNumberOrUndefined(row.total_area_m2),
    badges: row.badges && row.badges.length > 0 ? row.badges : undefined,
    image: row.cover_image ?? "",
    featured: row.featured ? true : undefined,
    agentName: row.agent_name ?? undefined,
    agentPhone: row.agent_phone ?? undefined,
    lat: toNumberOrUndefined(row.lat),
    lng: toNumberOrUndefined(row.lng),
  };
}

/* ---------- fallback memoria ---------- */

function memorySnapshot(): Property[] {
  return [...MOCK_PROPERTIES];
}

let warnedMemoryMode = false;
function warnMemoryMode(reason: string): void {
  if (warnedMemoryMode) return;
  warnedMemoryMode = true;
  log.warn("properties", "fallback memoria activado", { reason });
}

/* ---------- filtros publicos ---------- */

export interface PropertyFilters {
  featured?: boolean;
  city?: string;
  operationType?: PropertyOperation;
  propertyType?: PropertyType;
  limit?: number;
}

function applyFiltersMemory(items: Property[], filters: PropertyFilters): Property[] {
  let result = items;
  if (filters.featured === true) result = result.filter((p) => p.featured === true);
  if (filters.city) result = result.filter((p) => p.city === filters.city);
  if (filters.operationType) result = result.filter((p) => p.operation === filters.operationType);
  if (filters.propertyType) result = result.filter((p) => p.type === filters.propertyType);
  if (filters.limit && filters.limit > 0) result = result.slice(0, filters.limit);
  return result;
}

/* ---------- API publica ---------- */

export async function getAllProperties(filters: PropertyFilters = {}): Promise<Property[]> {
  if (!isSupabaseConfigured()) {
    warnMemoryMode("supabase no configurado");
    return applyFiltersMemory(memorySnapshot(), filters);
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("properties")
      .select(COLUMNS)
      .eq("published", true)
      .order("featured", { ascending: false })
      .order("featured_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (filters.featured === true) query = query.eq("featured", true);
    if (filters.city) query = query.eq("city", filters.city);
    if (filters.operationType) query = query.eq("operation_type", filters.operationType);
    if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
    if (filters.limit && filters.limit > 0) query = query.limit(filters.limit);

    const { data, error } = await withTimeout(query, 8000, "properties.select");

    if (error) {
      log.error("properties", "supabase select error", { message: error.message, code: error.code });
      warnMemoryMode("supabase select fallido");
      return applyFiltersMemory(memorySnapshot(), filters);
    }

    const rows = ((data as unknown) as PropertyRow[] | null) ?? [];
    if (rows.length === 0) {
      warnMemoryMode("tabla properties vacia");
      return applyFiltersMemory(memorySnapshot(), filters);
    }

    return rows.map(rowToProperty);
  } catch (err) {
    log.error("properties", "getAllProperties fallo", err instanceof Error ? err : { err: String(err) });
    warnMemoryMode("supabase exception");
    return applyFiltersMemory(memorySnapshot(), filters);
  }
}

export async function getFeaturedProperties(limit = 6): Promise<Property[]> {
  return getAllProperties({ featured: true, limit });
}

export async function getPropertyBySlug(slug: string): Promise<Property | null> {
  if (!slug) return null;

  if (!isSupabaseConfigured()) {
    return memorySnapshot().find((p) => p.slug === slug) ?? null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("properties")
        .select(COLUMNS)
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle(),
      4000,
      "properties.bySlug",
    );

    if (error) {
      log.error("properties", "supabase bySlug error", { slug, message: error.message, code: error.code });
      return memorySnapshot().find((p) => p.slug === slug) ?? null;
    }

    if (!data) {
      const fallback = memorySnapshot().find((p) => p.slug === slug);
      if (fallback) return fallback;
      log.info("properties", "slug no encontrado", { slug });
      return null;
    }

    return rowToProperty((data as unknown) as PropertyRow);
  } catch (err) {
    log.error("properties", "getPropertyBySlug fallo", err instanceof Error ? err : { err: String(err) });
    return memorySnapshot().find((p) => p.slug === slug) ?? null;
  }
}
