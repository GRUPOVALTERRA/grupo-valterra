"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import {
  getPropertyBySlug,
  updateProperty,
  createProperty,
  setPropertyStatus,
} from "@/services/properties";
import {
  canTransition,
  isPropertyStatus,
  type PropertyStatus,
} from "@/lib/property-status";
import { uploadPropertyImage } from "@/services/properties-storage";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateProperty } from "@/lib/validateProperty";

/**
 * Sprint 11 MF2 · Property cover upload action.
 *
 * Flow:
 *   1. Auth context (super-admin or member)
 *   2. Lookup property by slug (includeDraft=true)
 *   3. Ownership double-guard: super-admin OR scopedAgencyId === property.agencyId
 *   4. Upload via MF1 primitive
 *   5. UPDATE properties.cover_image with relative path
 *   6. revalidatePath
 */

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export interface UpdateCoverResult {
  ok: boolean;
  error?: string;
  publicUrl?: string;
}

export async function updatePropertyCoverAction(
  formData: FormData,
): Promise<UpdateCoverResult> {
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin && !ctx.scopedAgencyId) {
    return { ok: false, error: "Sesion no autorizada" };
  }

  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`upload:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, error: `Demasiados uploads. Reintenta en ${rl.retryAfterSec}s.` };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const file = formData.get("file");
  if (!slug) return { ok: false, error: "slug requerido" };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Archivo requerido" };
  }

  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property) return { ok: false, error: "Property no encontrada" };
  if (!property.id) return { ok: false, error: "Property sin id" };

  const propertyAgencyId = property.agencyId;
  if (!propertyAgencyId) {
    log.error("admin/properties", "property sin agency_id", { slug, propertyId: property.id });
    return { ok: false, error: "Property sin agency_id (data inconsistente)" };
  }

  const allowed = ctx.isSuperAdmin
    || ctx.memberships.some((m) => m.agencyId === propertyAgencyId);
  if (!allowed) {
    log.warn("admin/properties", "ownership denied", {
      slug, propertyAgencyId, userId: ctx.userId, isSuperAdmin: ctx.isSuperAdmin,
    });
    return { ok: false, error: "Sin permisos sobre esta property" };
  }

  const uploadRes = await uploadPropertyImage({
    agencyId: propertyAgencyId,
    propertyId: property.id,
    kind: "cover",
    file,
  });
  if (!uploadRes.ok) {
    log.error("admin/properties", "upload fallo", { slug, error: uploadRes.error });
    return { ok: false, error: uploadRes.error ?? "Upload fallo" };
  }

  const updateRes = await updateProperty({
    id: property.id,
    agencyId: propertyAgencyId,
    patch: { cover_image: uploadRes.path },
  });
  if (!updateRes.ok) {
    log.error("admin/properties", "DB update fallo · orphan file en storage", {
      slug, path: uploadRes.path, error: updateRes.error,
    });
    return { ok: false, error: `DB update fallo: ${updateRes.error ?? "unknown"}` };
  }

  log.info("admin/properties", "cover actualizada", {
    slug, propertyId: property.id, path: uploadRes.path,
  });

  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${slug}/edit-cover`);
  revalidatePath(`/propiedades/${slug}`);
  revalidatePath("/");

  return { ok: true, publicUrl: uploadRes.publicUrl };
}

/* ============================================================
 * Sprint 11 MF3 · Property full edit (details)
 * ============================================================ */

const DETAILS_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export interface UpdateDetailsResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function updatePropertyDetailsAction(
  formData: FormData,
): Promise<UpdateDetailsResult> {
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin && !ctx.scopedAgencyId) {
    return { ok: false, error: "Sesion no autorizada" };
  }

  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`prop-edit:${ip}`, DETAILS_RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, error: `Demasiados edits. Reintenta en ${rl.retryAfterSec}s.` };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "slug requerido" };

  // Validation (puro TS · espejo validateLead)
  const result = validateProperty({
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    operation_type: formData.get("operation_type"),
    property_type: formData.get("property_type"),
    city: formData.get("city"),
    neighborhood: formData.get("neighborhood"),
    province: formData.get("province"),
    address: formData.get("address"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    parking: formData.get("parking"),
    covered_area_m2: formData.get("covered_area_m2"),
    total_area_m2: formData.get("total_area_m2"),
    badges: formData.get("badges"),
    published: formData.get("published"),
  });
  if (!result.valid) {
    return { ok: false, error: "Revisa los campos marcados", fieldErrors: result.errors };
  }

  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property) return { ok: false, error: "Property no encontrada" };
  if (!property.id) return { ok: false, error: "Property sin id" };

  const propertyAgencyId = property.agencyId;
  if (!propertyAgencyId) {
    log.error("admin/properties", "details: property sin agency_id", { slug, propertyId: property.id });
    return { ok: false, error: "Property sin agency_id (data inconsistente)" };
  }

  const allowed = ctx.isSuperAdmin
    || ctx.memberships.some((m) => m.agencyId === propertyAgencyId);
  if (!allowed) {
    log.warn("admin/properties", "details: ownership denied", {
      slug, propertyAgencyId, userId: ctx.userId, isSuperAdmin: ctx.isSuperAdmin,
    });
    return { ok: false, error: "Sin permisos sobre esta property" };
  }

  // Build patch: solo los campos editables MF3. cover_image, featured, slug NO.
  const d = result.data;
  const updateRes = await updateProperty({
    id: property.id,
    agencyId: propertyAgencyId,
    patch: {
      title: d.title,
      description: d.description ?? null,
      price: d.price,
      currency: d.currency,
      operation_type: d.operation_type,
      property_type: d.property_type,
      city: d.city,
      neighborhood: d.neighborhood ?? null,
      province: d.province,
      address: d.address ?? null,
      bedrooms: d.bedrooms ?? null,
      bathrooms: d.bathrooms ?? null,
      parking: d.parking ?? null,
      covered_area_m2: d.covered_area_m2 ?? null,
      total_area_m2: d.total_area_m2 ?? null,
      badges: d.badges ?? [],
      published: d.published,
    },
  });
  if (!updateRes.ok) {
    log.error("admin/properties", "details: DB update fallo", {
      slug, error: updateRes.error,
    });
    return { ok: false, error: `DB update fallo: ${updateRes.error ?? "unknown"}` };
  }

  log.info("admin/properties", "details actualizados", {
    slug, propertyId: property.id, published: d.published,
  });

  // Note: leads.property_title is denormalized snapshot - intentionally NOT updated here.
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${slug}/edit`);
  revalidatePath(`/propiedades/${slug}`);
  revalidatePath("/");

  return { ok: true };
}

/* ==========================================================
 * Sprint 15-A · Alta y ciclo de vida
 * ========================================================== */

/**
 * Matriz de permisos derivada de la RLS vigente (migración 0005), sin inventar
 * roles nuevos:
 *   · insert/update de properties  → owner, admin, agent
 *   · delete ("managers")          → owner, admin
 * Publicar, despublicar y archivar cambian la visibilidad pública o retiran la
 * propiedad de circulación, así que se reservan al mismo conjunto de managers
 * que la política ya considera habilitado para las acciones destructivas.
 */
const EDITOR_ROLES = ["owner", "admin", "agent"] as const;
const MANAGER_ROLES = ["owner", "admin"] as const;

type AllowedRole = (typeof EDITOR_ROLES)[number];

/**
 * Resuelve agencia y permiso desde la sesión. El cliente nunca aporta
 * `agency_id`: se deriva del contexto autenticado.
 */
async function requireAgencyPermission(
  ctx: Awaited<ReturnType<typeof getAdminContext>>,
  need: "edit" | "manage",
  targetAgencyId?: string | null,
): Promise<{ ok: true; agencyId: string; userId: string | null } | { ok: false; error: string }> {
  const allowed = need === "manage" ? MANAGER_ROLES : EDITOR_ROLES;

  if (ctx.isSuperAdmin) {
    const agencyId = targetAgencyId ?? ctx.scopedAgencyId;
    if (!agencyId) return { ok: false, error: "Sin agencia en contexto" };
    return { ok: true, agencyId, userId: ctx.userId ?? null };
  }

  const agencyId = targetAgencyId ?? ctx.scopedAgencyId;
  if (!agencyId) return { ok: false, error: "Sesion no autorizada" };

  const membership = ctx.memberships.find((m) => m.agencyId === agencyId);
  if (!membership) return { ok: false, error: "No pertenece a esta agencia" };
  if (!(allowed as readonly string[]).includes(membership.role as AllowedRole)) {
    return {
      ok: false,
      error:
        need === "manage"
          ? "Tu rol no puede publicar ni archivar propiedades"
          : "Tu rol no puede editar propiedades",
    };
  }
  return { ok: true, agencyId, userId: ctx.userId ?? null };
}

export interface CreatePropertyResult {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  slug?: string;
}

/** Alta de propiedad. Siempre nace como borrador. */
export async function createPropertyAction(
  formData: FormData,
): Promise<CreatePropertyResult> {
  const ctx = await getAdminContext();
  const perm = await requireAgencyPermission(ctx, "edit");
  if (!perm.ok) return { ok: false, error: perm.error };

  const hdrs = await nextHeaders();
  const rl = rateLimit(`property-create:${getClientIp(hdrs)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return { ok: false, error: `Demasiadas altas. Reintenta en ${rl.retryAfterSec}s.` };
  }

  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const num = (k: string) => {
    const raw = str(k);
    if (!raw) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const validation = validateProperty({
    title: str("title"),
    description: str("description") || undefined,
    price: num("price") ?? undefined,
    currency: str("currency") || undefined,
    operation_type: str("operationType") || undefined,
    property_type: str("propertyType") || undefined,
    city: str("city") || undefined,
    province: str("province") || undefined,
  });
  if (!validation.valid) {
    return { ok: false, error: "Revisa los campos marcados", errors: validation.errors };
  }

  const res = await createProperty({
    agencyId: perm.agencyId,
    createdBy: perm.userId,
    data: {
      title: str("title"),
      description: str("description") || null,
      price: num("price") ?? 0,
      currency: str("currency") || "USD",
      operationType: str("operationType"),
      propertyType: str("propertyType"),
      city: str("city"),
      province: str("province"),
      neighborhood: str("neighborhood") || null,
      address: str("address") || null,
      bedrooms: num("bedrooms"),
      bathrooms: num("bathrooms"),
      parking: num("parking"),
      coveredAreaM2: num("coveredAreaM2"),
      totalAreaM2: num("totalAreaM2"),
    },
  });

  if (!res.ok) return { ok: false, error: res.error ?? "No se pudo crear la propiedad" };

  revalidatePath("/admin/properties");
  return { ok: true, slug: res.slug };
}

export interface StatusResult {
  ok: boolean;
  error?: string;
  status?: PropertyStatus;
}

/**
 * Publicar / despublicar / archivar / restaurar.
 *
 * Publicar exige que la propiedad tenga los campos mínimos válidos: una ficha
 * incompleta no puede llegar al sitio público.
 */
export async function setPropertyStatusAction(
  formData: FormData,
): Promise<StatusResult> {
  const ctx = await getAdminContext();

  const slug = String(formData.get("slug") ?? "").trim();
  const next = String(formData.get("status") ?? "").trim();
  if (!slug) return { ok: false, error: "slug requerido" };
  if (!isPropertyStatus(next)) return { ok: false, error: "Estado invalido" };

  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property?.id) return { ok: false, error: "Property no encontrada" };

  const perm = await requireAgencyPermission(ctx, "manage", property.agencyId ?? null);
  if (!perm.ok) return { ok: false, error: perm.error };
  if (property.agencyId && property.agencyId !== perm.agencyId) {
    return { ok: false, error: "Property de otra agencia" };
  }

  const current: PropertyStatus = property.status ?? (property.published ? "published" : "draft");
  if (current === next) return { ok: true, status: current };
  if (!canTransition(current, next)) {
    return { ok: false, error: `Transicion no permitida: ${current} → ${next}` };
  }

  if (next === "published") {
    const validation = validateProperty({
      title: property.title,
      description: property.description ?? undefined,
      price: property.price,
      currency: property.currency,
      operation_type: property.operation,
      property_type: property.type,
      city: property.city,
      province: property.province,
    });
    if (!validation.valid) {
      return { ok: false, error: "No se puede publicar: la ficha esta incompleta" };
    }
  }

  const res = await setPropertyStatus({
    id: property.id,
    agencyId: perm.agencyId,
    status: next,
    updatedBy: perm.userId,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "No se pudo cambiar el estado" };

  revalidatePath("/admin/properties");
  revalidatePath("/propiedades");
  revalidatePath(`/propiedades/${slug}`);
  revalidatePath("/");
  return { ok: true, status: next };
}
