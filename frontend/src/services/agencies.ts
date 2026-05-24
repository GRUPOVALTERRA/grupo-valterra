import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * Agencies service - Sprint 10 MF4 + MF5.
 * MF4: lookup canonico Valterra (cached).
 * MF5: lookup contacto por propertySlug y por agencyId.
 */

export interface AgencyLite {
  id: string;
  slug: string;
  name: string;
}

export interface AgencyContact {
  agencyId: string;
  contactEmail: string | null;
}

interface AgencyRow {
  id: string;
  slug: string;
  name: string;
}

// ---------- Cache module-level ----------
let cachedValterra: AgencyLite | null = null;
let cachedValterraFailedAt = 0;
const FAIL_TTL_MS = 60_000;

const contactCacheBySlug = new Map<string, { value: AgencyContact | null; at: number }>();
const contactCacheById = new Map<string, { value: string | null; at: number }>();
const CONTACT_CACHE_TTL_MS = 5 * 60_000; // 5 min - properties no cambian de agency seguido

function getCached<T>(map: Map<string, { value: T; at: number }>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CONTACT_CACHE_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

// ---------- Valterra (MF4) ----------
export async function getValterraAgency(): Promise<AgencyLite | null> {
  if (cachedValterra) return cachedValterra;
  if (Date.now() - cachedValterraFailedAt < FAIL_TTL_MS) return null;
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("agencies").select("id, slug, name").eq("slug", "valterra").maybeSingle(),
      4000,
      "agencies.valterra",
    );
    if (error) {
      log.error("agencies", "lookup valterra error", { message: error.message, code: error.code });
      cachedValterraFailedAt = Date.now();
      return null;
    }
    if (!data) {
      log.warn("agencies", "valterra no existe en DB (correr seed-agency-valterra.sql)");
      cachedValterraFailedAt = Date.now();
      return null;
    }
    cachedValterra = data as AgencyRow;
    return cachedValterra;
  } catch (err) {
    log.error("agencies", "getValterraAgency exception", err instanceof Error ? err : { err: String(err) });
    cachedValterraFailedAt = Date.now();
    return null;
  }
}

export async function getValterraAgencyId(): Promise<string | null> {
  const a = await getValterraAgency();
  return a?.id ?? null;
}

// ---------- MF5: lookups por slug / id ----------

/**
 * Dado un property slug, devuelve la agency owner + su contact_email.
 * Defense-in-depth: si slug no existe / supabase falla / agency no tiene
 * contact_email → null. Caller decide fallback (Valterra + env).
 *
 * NO throws. Cache 5min por slug.
 */
export async function getAgencyContactByPropertySlug(
  slug: string,
): Promise<AgencyContact | null> {
  if (!slug) return null;
  const cached = getCached(contactCacheBySlug, slug);
  if (cached !== undefined) return cached;

  if (!isSupabaseConfigured()) {
    contactCacheBySlug.set(slug, { value: null, at: Date.now() });
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    // JOIN: properties.agency_id → agencies (id, contact_email)
    const { data, error } = await withTimeout(
      supabase
        .from("properties")
        .select("agency_id, agencies(id, contact_email)")
        .eq("slug", slug)
        .maybeSingle(),
      4000,
      "agencies.byPropertySlug",
    );

    if (error) {
      log.warn("agencies", "byPropertySlug error", { slug, message: error.message });
      contactCacheBySlug.set(slug, { value: null, at: Date.now() });
      return null;
    }
    if (!data || !data.agency_id) {
      contactCacheBySlug.set(slug, { value: null, at: Date.now() });
      return null;
    }

    const ag = data.agencies as { id: string; contact_email: string | null } | { id: string; contact_email: string | null }[] | null;
    const agency = Array.isArray(ag) ? ag[0] : ag;
    const result: AgencyContact = {
      agencyId: data.agency_id as string,
      contactEmail: agency?.contact_email ?? null,
    };
    contactCacheBySlug.set(slug, { value: result, at: Date.now() });
    return result;
  } catch (err) {
    log.error("agencies", "byPropertySlug exception", err instanceof Error ? err : { err: String(err) });
    contactCacheBySlug.set(slug, { value: null, at: Date.now() });
    return null;
  }
}

/**
 * Dado un agency id, devuelve contact_email. null si no existe / falla.
 * Cache 5min por id.
 */
export async function getAgencyContactById(agencyId: string): Promise<string | null> {
  if (!agencyId) return null;
  const cached = getCached(contactCacheById, agencyId);
  if (cached !== undefined) return cached;

  if (!isSupabaseConfigured()) {
    contactCacheById.set(agencyId, { value: null, at: Date.now() });
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("agencies").select("contact_email").eq("id", agencyId).maybeSingle(),
      4000,
      "agencies.byId",
    );
    if (error || !data) {
      if (error) log.warn("agencies", "byId error", { agencyId, message: error.message });
      contactCacheById.set(agencyId, { value: null, at: Date.now() });
      return null;
    }
    const email = (data as { contact_email: string | null }).contact_email ?? null;
    contactCacheById.set(agencyId, { value: email, at: Date.now() });
    return email;
  } catch (err) {
    log.error("agencies", "byId exception", err instanceof Error ? err : { err: String(err) });
    contactCacheById.set(agencyId, { value: null, at: Date.now() });
    return null;
  }
}
