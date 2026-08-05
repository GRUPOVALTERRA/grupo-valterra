"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import { getPropertyBySlug } from "@/services/properties";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canManageGallery } from "@/lib/property-gallery";
import type { GalleryActionResult, GalleryErrorCode } from "@/lib/gallery-result";
import {
  addPropertyImage,
  listPropertyImages,
  removePropertyImage,
  reorderPropertyImages,
  setCoverImage,
  updateImageAlt,
} from "@/services/property-images";

/**
 * S17 PR2 — server actions de la galería administrativa.
 *
 * Contrato con el cliente: entran SOLO identificador de propiedad (slug),
 * archivo, imageId, alt y dirección del movimiento. Agencia, permisos,
 * storage_path y posiciones se resuelven acá. El cliente NUNCA envía
 * agency_id, storage_path ni posiciones absolutas.
 *
 * Salida: códigos cerrados. Jamás viaja al cliente un error de Storage, un
 * path, un id interno de agencia ni un stack.
 *
 * Autorización: owner/admin/agent de la agencia DE LA PROPIEDAD, o
 * super-admin. Ocultar los controles en la UI no autoriza nada: cada acción
 * revalida por su cuenta.
 */

const UPLOAD_RATE = { limit: 30, windowMs: 60_000 };

interface Scope {
  propertyId: string;
  agencyId: string;
}

/** Resuelve propiedad + agencia + permisos desde la sesión. */
async function resolveScope(
  slugRaw: unknown,
): Promise<{ ok: true; scope: Scope } | { ok: false; code: GalleryErrorCode }> {
  const slug = typeof slugRaw === "string" && slugRaw.length > 0 && slugRaw.length <= 200
    ? slugRaw
    : null;
  if (!slug) return { ok: false, code: "invalid-input" };

  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin && !ctx.userId) return { ok: false, code: "forbidden" };

  const property = await getPropertyBySlug(slug, { includeDraft: true });
  if (!property || !property.id) return { ok: false, code: "not-found" };
  const agencyId = property.agencyId;
  if (!agencyId) return { ok: false, code: "not-found" };

  const allowed =
    ctx.isSuperAdmin ||
    ctx.memberships.some((m) => m.agencyId === agencyId && canManageGallery(m.role));
  if (!allowed) {
    log.warn("admin/gallery", "acceso denegado", {
      slug, actorId: ctx.userId, isSuperAdmin: ctx.isSuperAdmin,
    });
    return { ok: false, code: "forbidden" };
  }
  return { ok: true, scope: { propertyId: property.id, agencyId } };
}

function refresh(slug: string): void {
  revalidatePath(`/admin/properties/${slug}/edit`);
  revalidatePath("/admin/properties");
}

/** Sube una o varias imágenes. Cada archivo se valida por contenido. */
export async function uploadPropertyImagesAction(
  formData: FormData,
): Promise<GalleryActionResult> {
  const slug = String(formData.get("slug") ?? "");
  const resolved = await resolveScope(slug);
  if (!resolved.ok) return { ok: false, code: resolved.code };

  const hdrs = await nextHeaders();
  const rl = rateLimit(`gallery:${getClientIp(hdrs)}`, UPLOAD_RATE);
  if (!rl.allowed) return { ok: false, code: "rate-limited" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, code: "invalid-input" };

  let uploaded = 0;
  let skipped = 0;
  let lastFailure: GalleryErrorCode | null = null;

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await addPropertyImage({
      propertyId: resolved.scope.propertyId,
      agencyId: resolved.scope.agencyId,
      bytes,
      declaredType: file.type || undefined,
    });
    if (res.ok) {
      uploaded += 1;
      continue;
    }
    skipped += 1;
    lastFailure = res.error.includes("máximo")
      ? "too-many-images"
      : res.error.includes("rechazado")
        ? "rejected-file"
        : res.error.includes("no configurado")
          ? "unavailable"
          : "storage-failed";
  }

  log.info("admin/gallery", "carga de imágenes", {
    propertyId: resolved.scope.propertyId,
    agencyId: resolved.scope.agencyId,
    uploaded,
    skipped,
  });

  if (uploaded === 0 && lastFailure) return { ok: false, code: lastFailure };
  refresh(slug);
  return { ok: true, uploaded, skipped };
}

export async function setPropertyCoverAction(
  slug: string,
  imageId: string,
): Promise<GalleryActionResult> {
  const resolved = await resolveScope(slug);
  if (!resolved.ok) return { ok: false, code: resolved.code };
  if (typeof imageId !== "string" || imageId.length === 0) {
    return { ok: false, code: "invalid-input" };
  }
  const res = await setCoverImage(imageId, resolved.scope.propertyId, resolved.scope.agencyId);
  if (!res.ok) return { ok: false, code: "not-found" };
  refresh(slug);
  return { ok: true };
}

/** Mueve una imagen una posición arriba o abajo. Orden calculado server-side. */
export async function movePropertyImageAction(
  slug: string,
  imageId: string,
  direction: "up" | "down",
): Promise<GalleryActionResult> {
  const resolved = await resolveScope(slug);
  if (!resolved.ok) return { ok: false, code: resolved.code };
  if (direction !== "up" && direction !== "down") return { ok: false, code: "invalid-input" };

  const current = await listPropertyImages(resolved.scope.propertyId, resolved.scope.agencyId);
  if (!current.ok) return { ok: false, code: "storage-failed" };

  const ids = current.value.map((i) => i.id);
  const index = ids.indexOf(imageId);
  if (index === -1) return { ok: false, code: "not-found" };
  const target = direction === "up" ? index - 1 : index + 1;
  // En los extremos no hay nada que hacer: no es un error.
  if (target < 0 || target >= ids.length) return { ok: true };

  const next = [...ids];
  next[index] = ids[target];
  next[target] = ids[index];

  const res = await reorderPropertyImages(resolved.scope.propertyId, resolved.scope.agencyId, next);
  if (!res.ok) return { ok: false, code: "storage-failed" };
  refresh(slug);
  return { ok: true };
}

export async function updatePropertyImageAltAction(
  slug: string,
  imageId: string,
  altText: string,
): Promise<GalleryActionResult> {
  const resolved = await resolveScope(slug);
  if (!resolved.ok) return { ok: false, code: resolved.code };
  const res = await updateImageAlt(
    imageId,
    resolved.scope.propertyId,
    resolved.scope.agencyId,
    altText,
  );
  if (!res.ok) return { ok: false, code: "not-found" };
  refresh(slug);
  return { ok: true };
}

export async function deletePropertyImageAction(
  slug: string,
  imageId: string,
): Promise<GalleryActionResult> {
  const resolved = await resolveScope(slug);
  if (!resolved.ok) return { ok: false, code: resolved.code };
  if (typeof imageId !== "string" || imageId.length === 0) {
    return { ok: false, code: "invalid-input" };
  }
  // El servicio verifica propiedad y agencia antes de tocar Storage y
  // promueve la portada siguiente si correspondiera.
  const res = await removePropertyImage(imageId, resolved.scope.propertyId, resolved.scope.agencyId);
  if (!res.ok) return { ok: false, code: "not-found" };
  log.info("admin/gallery", "imagen eliminada", {
    propertyId: resolved.scope.propertyId,
    agencyId: resolved.scope.agencyId,
  });
  refresh(slug);
  return { ok: true };
}
