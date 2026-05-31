import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { MOCK_PROPERTIES, type Property, type PropertyOperation, type PropertyType } from "./mock-properties";
import { getPropertyImageUrl } from "./properties-storage";

/**
 * Service properties - patron hybrid Supabase + fallback memoria.
 * Sprint 9 MVP · Sprint 10 MF4 (agencyId filter) · Sprint 11 MF2 (storage)
 *  · Sprint 11 MF3 (updateProperty extended + description + published mapping).
 */

/* ---------- DB row (snake_case - matchea migracion 0002) ---------- */

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

/**
 * Sprint 11 MF2 · Dual-mode cover_image resolution.
 * Preserva URLs absolutas legacy + resuelve Storage paths nuevos.
 * Order: null -> http(s) -> /asset -> data: -> Supabase Storage path
 */
function resolveCoverImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  if (value.startsWith("data:")) return value;
  return getPropertyImageUrl(value);
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
    image: resolveCoverImageUrl(row.cover_image) ?? "",
    featured: row.featured ? true : undefined,
    agentName: row.agent_name ?? undefined,
    agentPhone: row.agent_phone ?? undefined,
    agencyId: row.agency_id ?? undefined,
    description: row.description ?? undefined,
    published: row.published,
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
  agencyId?: string;
  /** Sprint 11 MF2: include unpublished properties. Admin path only. Default false. */
  includeDraft?: boolean;
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
      .order("featured", { ascending: false })
      .order("featured_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!filters.includeDraft) query = query.eq("published", true);
    if (filters.featured === true) query = query.eq("featured", true);
    if (filters.city) query = query.eq("city", filters.city);
    if (filters.operationType) query = query.eq("operation_type", filters.operationType);
    if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
    if (filters.agencyId) query = query.eq("agency_id", filters.agencyId);
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

export interface GetPropertyBySlugOptions {
  /** Sprint 11 MF2: include unpublished. Admin/owner path only. Default false. */
  includeDraft?: boolean;
}

export async function getPropertyBySlug(
  slug: string,
  options: GetPropertyBySlugOptions = {},
): Promise<Property | null> {
  if (!slug) return null;
  if (!isSupabaseConfigured()) {
    return memorySnapshot().find((p) => p.slug === slug) ?? null;
  }
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase.from("properties").select(COLUMNS).eq("slug", slug);
    if (!options.includeDraft) q = q.eq("published", true);
    const { data, error } = await withTimeout(q.maybeSingle(), 4000, "properties.bySlug");
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

/* ---------- Sprint 11 MF2 + MF3 · update ---------- */

/**
 * Patch shape: DB column names (snake_case). Only fields explicitly listed.
 * Defense-in-depth: WHERE agency_id = agencyId previene cross-agency writes
 * aunque RLS este abierto.
 *
 * Sprint 11 MF3 extends with 11 additional editable fields (operation/type/
 * location/areas) usado por updatePropertyDetailsAction.
 */
export interface PropertyUpdatePatch {
  cover_image?: string | null;
  published?: boolean;
  featured?: boolean;
  featured_order?: number;
  title?: string;
  description?: string | null;
  price?: number;
  currency?: "USD" | "ARS";
  badges?: string[];
  // Sprint 11 MF3 additions:
  operation_type?: PropertyOperation;
  property_type?: PropertyType;
  city?: string;
  neighborhood?: string | null;
  province?: string;
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
  covered_area_m2?: number | null;
  total_area_m2?: number | null;
}

export async function updateProperty(args: {
  id: string;
  agencyId: string;
  patch: PropertyUpdatePatch;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.id || !args.agencyId) {
    return { ok: false, error: "id y agencyId son requeridos" };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado" };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("properties")
        .update(args.patch)
        .eq("id", args.id)
        .eq("agency_id", args.agencyId),
      6000,
      "properties.update",
    );
    if (error) {
      log.error("properties", "update error", {
        id: args.id,
        agencyId: args.agencyId,
        message: error.message,
        code: error.code,
      });
      return { ok: false, error: error.message };
    }
    log.info("properties", "property actualizada", { id: args.id, agencyId: args.agencyId });
    return { ok: true };
  } catch (err) {
    log.error("properties", "update exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
