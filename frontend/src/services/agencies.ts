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

/**
 * Slug de la agencia CANONICA de Grupo Valterra.
 *
 * HOTFIX S20.5 (12-08-2026) — antes decia "valterra".
 *
 * Production tenia DOS filas llamadas "Grupo Valterra":
 *   grupovalterra  f8418ade…  creada el 07-08  <- canonica
 *   valterra       b1b8b5e3…  creada el 24-05  <- seed original
 *
 * Este lookup resolvia la del seed, mientras la propiedad publicada, sus
 * imagenes, el unico lead real y el unico evento de analitica colgaban de la
 * otra. Consecuencia: el contexto admin quedaba scoped a una agencia vacia y
 * /admin/estadisticas mostraba cero actividad propia aunque la hubiera. El
 * scoping funcionaba bien; la identidad del tenant estaba mal.
 *
 * DEUDA REGISTRADA — PEND-CANONICAL-AGENCY-CONFIG: un slug hardcodeado sigue
 * siendo una dependencia operativa. Que la identidad canonica del negocio
 * dependa de una cadena en el codigo significa que renombrar un slug en la
 * base rompe el panel sin que nada lo avise. La solucion real es una marca
 * explicita en la tabla (o configuracion), y va en un sprint aparte: este
 * cambio corrige Production sin ampliar el alcance.
 */
export const CANONICAL_AGENCY_SLUG = "grupovalterra";

/** Slug del seed original. Documentado para que nadie lo reintroduzca. */
export const LEGACY_AGENCY_SLUG = "valterra";

export async function getValterraAgency(): Promise<AgencyLite | null> {
  if (cachedValterra) return cachedValterra;
  if (Date.now() - cachedValterraFailedAt < FAIL_TTL_MS) return null;
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .select("id, slug, name")
        .eq("slug", CANONICAL_AGENCY_SLUG)
        .maybeSingle(),
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

// ---------- WhatsApp por agency (botón "Consultar por WhatsApp") ----------

/**
 * Normaliza un teléfono a dígitos para wa.me (ej: "+54 9 379 465-6610" → "5493794656610").
 * Números argentinos: wa.me requiere el "9" entre el código de país y el área
 * para celulares; si falta ("54379...") se inserta.
 */
function toWaDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("54") && !digits.startsWith("549")) {
    digits = `549${digits.slice(2)}`;
  }
  return digits;
}

const whatsappCache = new Map<string, { value: string | null; at: number }>();

/**
 * WhatsApp de contacto de la agency (whatsapp, fallback contact_phone),
 * ya normalizado para wa.me. null si la agency no tiene número cargado.
 * Cache 5min. NO throws.
 */
export async function getAgencyWhatsappById(
  agencyId: string | null | undefined,
): Promise<string | null> {
  if (!agencyId) return null;
  const cached = getCached(whatsappCache, agencyId);
  if (cached !== undefined) return cached;

  if (!isSupabaseConfigured()) {
    whatsappCache.set(agencyId, { value: null, at: Date.now() });
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("agencies").select("whatsapp, contact_phone").eq("id", agencyId).maybeSingle(),
      4000,
      "agencies.whatsappById",
    );
    if (error || !data) {
      if (error) log.warn("agencies", "whatsappById error", { agencyId, message: error.message });
      whatsappCache.set(agencyId, { value: null, at: Date.now() });
      return null;
    }
    const row = data as { whatsapp: string | null; contact_phone: string | null };
    const value = toWaDigits(row.whatsapp) ?? toWaDigits(row.contact_phone);
    whatsappCache.set(agencyId, { value, at: Date.now() });
    return value;
  } catch (err) {
    log.error("agencies", "whatsappById exception", err instanceof Error ? err : { err: String(err) });
    whatsappCache.set(agencyId, { value: null, at: Date.now() });
    return null;
  }
}

/**
 * Mapa agencyId → WhatsApp normalizado, para listados (una sola query).
 * Solo incluye agencies con número cargado. Cache 5min. NO throws.
 */
let whatsappMapCache: { value: Record<string, string>; at: number } | null = null;

export async function getAgencyWhatsappMap(): Promise<Record<string, string>> {
  if (whatsappMapCache && Date.now() - whatsappMapCache.at <= CONTACT_CACHE_TTL_MS) {
    return whatsappMapCache.value;
  }
  if (!isSupabaseConfigured()) return {};

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("agencies").select("id, whatsapp, contact_phone"),
      4000,
      "agencies.whatsappMap",
    );
    if (error || !data) {
      if (error) log.warn("agencies", "whatsappMap error", { message: error.message });
      return {};
    }
    const map: Record<string, string> = {};
    for (const row of data as { id: string; whatsapp: string | null; contact_phone: string | null }[]) {
      const value = toWaDigits(row.whatsapp) ?? toWaDigits(row.contact_phone);
      if (value) map[row.id] = value;
    }
    whatsappMapCache = { value: map, at: Date.now() };
    return map;
  } catch (err) {
    log.error("agencies", "whatsappMap exception", err instanceof Error ? err : { err: String(err) });
    return {};
  }
}

// ============================================================
// MF6: CRUD agencies + members (super-admin only · llama desde server actions)
// SERVICE_ROLE bypass RLS - controlamos auth en el caller.
// ============================================================

export type AgencyRole = "owner" | "admin" | "agent" | "viewer";

export interface AgencyFull {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  cuit: string | null;
  matricula: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  created_at: string;
}

export interface AgencyMemberLite {
  user_id: string;
  role: AgencyRole;
  joined_at: string | null;
  invited_at: string | null;
  created_at: string;
}

export interface CreateAgencyInput {
  slug: string;
  name: string;
  contact_email?: string;
  contact_phone?: string;
  whatsapp?: string;
  city?: string;
  province?: string;
}

export interface CreateAgencyResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** Lista todas las agencies. Para super-admin dashboard. */
export async function listAgencies(): Promise<AgencyFull[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .select("id, slug, name, legal_name, cuit, matricula, contact_email, contact_phone, whatsapp, address, city, province, created_at")
        .order("created_at", { ascending: false }),
      6000,
      "agencies.list",
    );
    if (error) {
      log.error("agencies", "list error", { message: error.message });
      return [];
    }
    return (data as AgencyFull[] | null) ?? [];
  } catch (err) {
    log.error("agencies", "list exception", err instanceof Error ? err : { err: String(err) });
    return [];
  }
}

export async function getAgencyBySlug(slug: string): Promise<AgencyFull | null> {
  if (!slug || !isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .select("id, slug, name, legal_name, cuit, matricula, contact_email, contact_phone, whatsapp, address, city, province, created_at")
        .eq("slug", slug)
        .maybeSingle(),
      4000,
      "agencies.bySlug",
    );
    if (error) {
      log.warn("agencies", "bySlug error", { slug, message: error.message });
      return null;
    }
    return (data as AgencyFull | null) ?? null;
  } catch (err) {
    log.error("agencies", "bySlug exception", err instanceof Error ? err : { err: String(err) });
    return null;
  }
}

export async function createAgency(input: CreateAgencyInput): Promise<CreateAgencyResult> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!SLUG_RX.test(slug)) return { ok: false, error: "Slug invalido (a-z, 0-9, -, 2-80 chars)" };
  if (name.length < 2 || name.length > 200) return { ok: false, error: "Nombre invalido (2-200 chars)" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .insert({
          slug,
          name,
          contact_email: input.contact_email?.trim() || null,
          contact_phone: input.contact_phone?.trim() || null,
          whatsapp: input.whatsapp?.trim() || null,
          city: input.city?.trim() || null,
          province: input.province?.trim() || null,
        })
        .select("id")
        .single(),
      6000,
      "agencies.create",
    );
    if (error) {
      const msg = error.message.includes("duplicate") ? "Ya existe una agency con ese slug" : error.message;
      log.warn("agencies", "create error", { slug, message: error.message });
      return { ok: false, error: msg };
    }
    log.info("agencies", "agency creada", { id: data.id, slug });
    return { ok: true, id: data.id as string };
  } catch (err) {
    log.error("agencies", "create exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/** Lista members de una agency. */
export async function listAgencyMembers(agencyId: string): Promise<AgencyMemberLite[]> {
  if (!agencyId || !isSupabaseConfigured()) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agency_members")
        .select("user_id, role, joined_at, invited_at, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: true }),
      4000,
      "agency_members.list",
    );
    if (error) {
      log.warn("agency_members", "list error", { agencyId, message: error.message });
      return [];
    }
    return (data as AgencyMemberLite[] | null) ?? [];
  } catch (err) {
    log.error("agency_members", "list exception", err instanceof Error ? err : { err: String(err) });
    return [];
  }
}

/**
 * Sprint 13 · C2D6 — `addAgencyMembership()` fue ELIMINADA.
 *
 * Era un UPSERT con `onConflict: agency_id,user_id` que SOBRESCRIBÍA el rol de
 * una membership existente, y su único consumidor era el flujo legado de
 * /auth/callback basado en `user_metadata` (pending_agency_id / pending_role).
 *
 * La única vía para crear una membership por invitación es ahora la RPC
 * `public.accept_agency_invite(p_invite_id)` (migración 0008), que usa
 * `ON CONFLICT DO NOTHING` y JAMÁS actualiza un rol existente.
 */

/** Obtiene un member específico de una agency. Retorna null si no existe. */
export async function getAgencyMember(
  agencyId: string,
  userId: string,
): Promise<AgencyMemberLite | null> {
  if (!agencyId || !userId || !isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agency_members")
        .select("user_id, role, joined_at, invited_at, created_at")
        .eq("agency_id", agencyId)
        .eq("user_id", userId)
        .maybeSingle(),
      4000,
      "agency_members.getSingle",
    );
    if (error) {
      log.warn("agency_members", "getSingle error", { agencyId, userId, message: error.message });
      return null;
    }
    return (data as AgencyMemberLite | null) ?? null;
  } catch (err) {
    log.error("agency_members", "getSingle exception", err instanceof Error ? err : { err: String(err) });
    return null;
  }
}

/** Cuenta owners activos en una agency. Usado para guard "ultimo owner". */
export async function countAgencyOwners(agencyId: string): Promise<number> {
  if (!agencyId || !isSupabaseConfigured()) return 0;
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await withTimeout(
      supabase
        .from("agency_members")
        .select("user_id", { count: "exact", head: true })
        .eq("agency_id", agencyId)
        .eq("role", "owner"),
      4000,
      "agency_members.countOwners",
    );
    if (error) {
      log.warn("agency_members", "countOwners error", { agencyId, message: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    log.error("agency_members", "countOwners exception", err instanceof Error ? err : { err: String(err) });
    return 0;
  }
}

/** Actualiza el rol de un member existente. */
export async function updateMemberRole(
  agencyId: string,
  userId: string,
  role: AgencyRole,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("agency_members")
        .update({ role })
        .eq("agency_id", agencyId)
        .eq("user_id", userId),
      4000,
      "agency_members.updateRole",
    );
    if (error) {
      log.error("agency_members", "updateRole error", { agencyId, userId, role, message: error.message });
      return { ok: false, error: error.message };
    }
    log.info("agency_members", "role updated", { agencyId, userId, role });
    return { ok: true };
  } catch (err) {
    log.error("agency_members", "updateRole exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/** Elimina un member de una agency. */
export async function removeAgencyMember(
  agencyId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("agency_members")
        .delete()
        .eq("agency_id", agencyId)
        .eq("user_id", userId),
      4000,
      "agency_members.remove",
    );
    if (error) {
      log.error("agency_members", "remove error", { agencyId, userId, message: error.message });
      return { ok: false, error: error.message };
    }
    log.info("agency_members", "member removed", { agencyId, userId });
    return { ok: true };
  } catch (err) {
    log.error("agency_members", "remove exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/* ==========================================================
 * Sprint 16 · Configuración editable de agencia
 * ========================================================== */

export interface UpdateAgencyPatch {
  name?: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
}

/**
 * Actualiza los datos de contacto y presentación de una agencia.
 *
 * El `agencyId` lo resuelve la server action desde la sesión: este servicio
 * jamás recibe un id elegido por el navegador. El slug NO es editable — es la
 * clave pública de la agencia. `contact_email` es el destinatario de las
 * notificaciones de leads; no se usa como remitente de Auth (eso es
 * RESEND_SENDER) ni se valida aquí más allá del formato: la validación
 * semántica vive en la action.
 */
export async function updateAgency(args: {
  agencyId: string;
  patch: UpdateAgencyPatch;
  updatedBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.agencyId) return { ok: false, error: "agencyId requerido" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };

  const clean: Record<string, string | null> = {};
  const set = (k: keyof UpdateAgencyPatch) => {
    const v = args.patch[k];
    if (v === undefined) return;
    clean[k] = typeof v === "string" ? v.trim() || null : null;
  };
  (["name", "contact_email", "contact_phone", "whatsapp", "address", "city", "province"] as const)
    .forEach(set);

  if (Object.keys(clean).length === 0) return { ok: false, error: "Sin cambios" };
  if (clean.name !== undefined && (clean.name === null || clean.name.length < 2 || clean.name.length > 200)) {
    return { ok: false, error: "Nombre invalido (2-200 chars)" };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase.from("agencies").update(clean).eq("id", args.agencyId),
      6000,
      "agencies.update",
    );
    if (error) {
      log.error("agencies", "update error", { agencyId: args.agencyId, message: error.message });
      return { ok: false, error: error.message };
    }
    // Auditable: quién cambió qué campos (no los valores, que pueden ser PII).
    log.info("agencies", "agency actualizada", {
      agencyId: args.agencyId,
      fields: Object.keys(clean),
      updatedBy: args.updatedBy ?? "unknown",
    });
    return { ok: true };
  } catch (err) {
    log.error("agencies", "update exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
