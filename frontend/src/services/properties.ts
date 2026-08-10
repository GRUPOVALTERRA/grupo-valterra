import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { effectiveStatus, type PropertyStatus } from "@/lib/property-status";
import { buildSearchOrFilter, matchesSearch } from "@/lib/property-search";
import { slugify, resolveSlug } from "@/lib/property-slug";
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
  // S18 PR1: lat/lng (0002) son la ubicacion INTERNA exacta y NO se
  // seleccionan ni mapean aca — invariante de privacidad CORE-GEO-01.
  // La ubicacion publicable llega por public_* (0013) via lib/geo.
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
  status?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  featured: boolean;
  featured_order: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS_BASE =
  "id,slug,title,description,price,currency,per_month,operation_type,property_type," +
  "city,neighborhood,province,country,address," +
  "bedrooms,bathrooms,parking,covered_area_m2,total_area_m2," +
  "badges,cover_image,gallery,agent_name,agent_phone,agency_id," +
  "published,featured,featured_order,created_at,updated_at";

/**
 * Columnas del ciclo de vida (migración 0009).
 *
 * Se piden aparte y con reintento: si el despliegue llega antes que la
 * migración, el SELECT extendido falla por columna inexistente y, sin este
 * fallback, el servicio caería al snapshot en memoria y el sitio público
 * mostraría las propiedades de muestra en lugar de las reales. Con el
 * reintento, el orden entre deploy y migración deja de importar.
 */
const COLUMNS = `${COLUMNS_BASE},status,published_at,archived_at`;

/** true si el error corresponde a una columna que todavía no existe. */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42703 = undefined_column en PostgreSQL
  return err.code === "42703" || /column .* does not exist/i.test(err.message ?? "");
}

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
    status: (row.status as PropertyStatus | undefined) ?? (row.published ? "published" : "draft"),
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
  /**
   * Sprint 15-B: estados del ciclo de vida admitidos. Admin path only.
   * `undefined` es "sin restriccion"; el panel sólo lo manda al pedir "Todas".
   */
  statuses?: readonly PropertyStatus[];
  /** Sprint 15-B: texto libre sobre titulo/slug/ciudad/barrio. Admin path only. */
  search?: string;
  /**
   * Sprint 15-B: permitir el snapshot de muestra si no hay datos reales.
   * El sitio publico lo quiere (nunca queda en blanco por un problema de
   * infraestructura); el panel no, porque ofrece editar y publicar sobre cada
   * fila y esas acciones no pueden apuntar a una propiedad inventada.
   * Default true, que es el comportamiento historico.
   */
  allowSampleFallback?: boolean;
  limit?: number;
}

/**
 * ¿Se puede rellenar con el snapshot de muestra?
 *
 * No, si quien llama lo prohibió, y tampoco si la consulta llevaba un filtro de
 * estado o una búsqueda: ahí cero filas es una respuesta legítima y no la señal
 * de una base sin datos que el snapshot venía a cubrir.
 */
function sampleFallbackAllowed(filters: PropertyFilters): boolean {
  if (filters.allowSampleFallback === false) return false;
  return !(filters.statuses || filters.search);
}

function applyFiltersMemory(items: Property[], filters: PropertyFilters): Property[] {
  let result = items;
  if (filters.featured === true) result = result.filter((p) => p.featured === true);
  if (filters.city) result = result.filter((p) => p.city === filters.city);
  if (filters.operationType) result = result.filter((p) => p.operation === filters.operationType);
  if (filters.propertyType) result = result.filter((p) => p.type === filters.propertyType);
  if (filters.statuses) {
    const statuses = filters.statuses;
    result = result.filter((p) => statuses.includes(effectiveStatus(p)));
  }
  if (filters.search) {
    const term = filters.search;
    result = result.filter((p) => matchesSearch(p, term));
  }
  if (filters.limit && filters.limit > 0) result = result.slice(0, filters.limit);
  return result;
}

/* ---------- API publica ---------- */

export async function getAllProperties(filters: PropertyFilters = {}): Promise<Property[]> {
  if (!isSupabaseConfigured()) {
    warnMemoryMode("supabase no configurado");
    if (!sampleFallbackAllowed(filters)) return [];
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
    if (filters.statuses) query = query.in("status", [...filters.statuses]);
    if (filters.search) query = query.or(buildSearchOrFilter(filters.search));
    if (filters.limit && filters.limit > 0) query = query.limit(filters.limit);

    let { data, error } = await withTimeout(query, 8000, "properties.select");

    if (isMissingColumn(error)) {
      // Migración 0009 aún no aplicada: reintentar sin las columnas nuevas.
      log.warn("properties", "columnas de ciclo de vida ausentes; usando esquema previo");

      let legacy = supabase.from("properties").select(COLUMNS_BASE);
      if (filters.agencyId) legacy = legacy.eq("agency_id", filters.agencyId);
      if (!filters.includeDraft) legacy = legacy.eq("published", true);

      // Sin columna `status`, el ciclo de vida se reduce al espejo `published`:
      // sólo "borrador" y "publicada" son representables. Un filtro que pide
      // únicamente estados que la migración 0009 introduce devuelve vacío, no
      // la lista entera, que es lo que haría un filtro ignorado en silencio.
      if (filters.statuses) {
        const wantsPublished = filters.statuses.includes("published");
        const wantsDraft = filters.statuses.includes("draft");
        if (!wantsPublished && !wantsDraft) return [];
        if (wantsPublished && !wantsDraft) legacy = legacy.eq("published", true);
        if (wantsDraft && !wantsPublished) legacy = legacy.eq("published", false);
      }

      if (filters.operationType) legacy = legacy.eq("operation_type", filters.operationType);
      if (filters.propertyType) legacy = legacy.eq("property_type", filters.propertyType);
      if (filters.city) legacy = legacy.ilike("city", `%${filters.city}%`);
      if (filters.search) legacy = legacy.or(buildSearchOrFilter(filters.search));
      if (filters.limit) legacy = legacy.limit(filters.limit);
      const retry = await withTimeout(legacy, 8000, "properties.select.legacy");
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error) {
      log.error("properties", "supabase select error", { message: error.message, code: error.code });
      warnMemoryMode("supabase select fallido");
      if (!sampleFallbackAllowed(filters)) return [];
      return applyFiltersMemory(memorySnapshot(), filters);
    }
    const rows = ((data as unknown) as PropertyRow[] | null) ?? [];
    if (rows.length === 0) {
      if (!sampleFallbackAllowed(filters)) return [];
      warnMemoryMode("tabla properties vacia");
      return applyFiltersMemory(memorySnapshot(), filters);
    }
    return rows.map(rowToProperty);
  } catch (err) {
    log.error("properties", "getAllProperties fallo", err instanceof Error ? err : { err: String(err) });
    warnMemoryMode("supabase exception");
    if (!sampleFallbackAllowed(filters)) return [];
    return applyFiltersMemory(memorySnapshot(), filters);
  }
}

export async function getFeaturedProperties(limit = 6): Promise<Property[]> {
  // Público (home). Sin muestras: si no hay propiedades reales publicadas,
  // la home muestra el banner DISPONIBLE en lugar del snapshot de prueba.
  return getAllProperties({ featured: true, limit, allowSampleFallback: false });
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
    let { data, error } = await withTimeout(q.maybeSingle(), 4000, "properties.bySlug");

    if (isMissingColumn(error)) {
      // Migración 0009 aún no aplicada: reintentar con el esquema previo.
      log.warn("properties", "columnas de ciclo de vida ausentes (bySlug); esquema previo");
      let legacy = supabase.from("properties").select(COLUMNS_BASE).eq("slug", slug);
      if (!options.includeDraft) legacy = legacy.eq("published", true);
      const retry = await withTimeout(legacy.maybeSingle(), 4000, "properties.bySlug.legacy");
      data = retry.data as typeof data;
      error = retry.error;
    }
    if (error) {
      log.error("properties", "supabase bySlug error", { slug, message: error.message, code: error.code });
      return null;
    }
    if (!data) {
      // Sin fallback al snapshot de muestra: una propiedad que no existe (o no
      // está publicada) responde 404 en lugar de servir una ficha de prueba.
      log.info("properties", "slug no encontrado", { slug });
      return null;
    }
    return rowToProperty((data as unknown) as PropertyRow);
  } catch (err) {
    log.error("properties", "getPropertyBySlug fallo", err instanceof Error ? err : { err: String(err) });
    return null;
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

/* ==========================================================
 * S19 · Destacadas de portada
 * ========================================================== */

/**
 * Marca o desmarca una propiedad como destacada (portada).
 *
 * `featured` es lo que consume la home (`getFeaturedProperties`), que además
 * exige `published`: destacar un borrador no la publica ni la muestra.
 * El scoping por agencia lo garantiza el caller (server action); acá se
 * exige igual el par (id, agency_id) como en el resto de los updates.
 */
export async function setPropertyFeatured(args: {
  id: string;
  agencyId: string;
  featured: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.id || !args.agencyId) return { ok: false, error: "id y agencyId requeridos" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("properties")
        .update({ featured: args.featured })
        .eq("id", args.id)
        .eq("agency_id", args.agencyId),
      6000,
      "properties.setFeatured",
    );
    if (error) {
      log.error("properties", "setFeatured error", { id: args.id, code: error.code ?? "unknown" });
      return { ok: false, error: "No se pudo cambiar el destaque" };
    }
    log.info("properties", "featured actualizado", { id: args.id, featured: args.featured });
    return { ok: true };
  } catch (err) {
    log.error("properties", "setFeatured exception", {
      id: args.id,
      kind: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, error: "No se pudo cambiar el destaque" };
  }
}

/* ==========================================================
 * Sprint 15-A · Alta y ciclo de vida
 * ========================================================== */

/**
 * Crea una propiedad como BORRADOR.
 *
 * `agencyId` lo resuelve el server desde la sesión (nunca llega del cliente),
 * y el `slug` se deriva del título con resolución determinística de colisiones.
 * El estado inicial es siempre `draft`: publicar es un paso explícito y aparte.
 */
export async function createProperty(args: {
  agencyId: string;
  createdBy?: string | null;
  data: {
    title: string;
    description?: string | null;
    price: number;
    currency: string;
    operationType: string;
    propertyType: string;
    city: string;
    province: string;
    neighborhood?: string | null;
    address?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    parking?: number | null;
    coveredAreaM2?: number | null;
    totalAreaM2?: number | null;
  };
}): Promise<{ ok: boolean; slug?: string; id?: string; error?: string }> {
  if (!args.agencyId) return { ok: false, error: "agencyId requerido" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };

  const base = slugify(args.data.title);
  if (!base) return { ok: false, error: "El titulo no permite generar un slug" };

  try {
    const supabase = getSupabaseAdmin();

    // Slugs ya ocupados que comparten la base, para resolver colisión.
    const { data: taken, error: takenErr } = await withTimeout(
      supabase.from("properties").select("slug").like("slug", `${base}%`),
      6000,
      "properties.slugScan",
    );
    if (takenErr) {
      log.error("properties", "slug scan error", { message: takenErr.message });
      return { ok: false, error: takenErr.message };
    }
    const slug = resolveSlug(args.data.title, (taken ?? []).map((r) => r.slug as string));

    const d = args.data;
    const { data: inserted, error } = await withTimeout(
      supabase
        .from("properties")
        .insert({
          slug,
          title: d.title,
          description: d.description ?? null,
          price: d.price,
          currency: d.currency,
          operation_type: d.operationType,
          property_type: d.propertyType,
          city: d.city,
          province: d.province,
          neighborhood: d.neighborhood ?? null,
          address: d.address ?? null,
          bedrooms: d.bedrooms ?? null,
          bathrooms: d.bathrooms ?? null,
          parking: d.parking ?? null,
          covered_area_m2: d.coveredAreaM2 ?? null,
          total_area_m2: d.totalAreaM2 ?? null,
          agency_id: args.agencyId,
          status: "draft",
          created_by: args.createdBy ?? null,
          updated_by: args.createdBy ?? null,
        })
        .select("id,slug")
        .single(),
      6000,
      "properties.insert",
    );

    if (error) {
      log.error("properties", "insert error", {
        agencyId: args.agencyId,
        message: error.message,
        code: error.code,
      });
      return { ok: false, error: error.message };
    }

    log.info("properties", "property creada (draft)", {
      id: inserted?.id,
      slug: inserted?.slug,
      agencyId: args.agencyId,
    });
    return { ok: true, id: inserted?.id as string, slug: inserted?.slug as string };
  } catch (err) {
    log.error("properties", "insert exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Cambia el estado de una propiedad.
 *
 * El filtro por `agency_id` es un segundo cerrojo además de la verificación de
 * pertenencia que hace la server action: si la propiedad no es de esa agencia,
 * el UPDATE no afecta ninguna fila.
 */
export async function setPropertyStatus(args: {
  id: string;
  agencyId: string;
  status: string;
  updatedBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.id || !args.agencyId) return { ok: false, error: "id y agencyId son requeridos" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("properties")
        .update({ status: args.status, updated_by: args.updatedBy ?? null })
        .eq("id", args.id)
        .eq("agency_id", args.agencyId),
      6000,
      "properties.setStatus",
    );
    if (error) {
      log.error("properties", "setStatus error", {
        id: args.id,
        agencyId: args.agencyId,
        status: args.status,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    log.info("properties", "status actualizado", {
      id: args.id,
      agencyId: args.agencyId,
      status: args.status,
    });
    return { ok: true };
  } catch (err) {
    log.error("properties", "setStatus exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
