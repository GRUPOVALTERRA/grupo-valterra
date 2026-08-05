import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { uploadObject, deleteObject, resolvePublicUrl } from "@/lib/storage";
import { inspectImageBytes } from "@/lib/image-type";
import {
  GALLERY_BUCKET,
  MAX_IMAGES_PER_PROPERTY,
  buildGalleryPath,
  sanitizeAltText,
  normalizeOrder,
} from "@/lib/property-gallery";

/**
 * S17 PR1 — servicio de galería de propiedades (tabla property_images, 0012).
 *
 * Contratos:
 * - TODA operación exige (propertyId, agencyId) resueltos por el CALLER
 *   server-side (sesión → getAdminContext, patrón del reintento de leads).
 *   Cada UPDATE/DELETE pinea ambos: una fila de otra agencia es invisible
 *   e intocable. La FK compuesta de 0012 es la defensa final.
 * - El cliente jamás aporta storage_path: se genera acá (aleatorio) y la
 *   extensión sale del tipo REAL por magic bytes (lib/image-type).
 * - Huérfanos: si falla el INSERT tras subir, se borra el objeto (best
 *   effort + log). Si falla Storage al eliminar, la fila ya no existe y el
 *   objeto queda no-referenciado y no-enumerable: se registra para limpieza.
 * - Portada: la transición es unset→set (el índice único parcial de 0012
 *   impide dos portadas; el estado intermedio "sin portada" es legal). La
 *   caché properties.cover_image se sincroniza DESPUÉS de la tabla; si esa
 *   escritura falla queda registrado (la tabla es la verdad; PR3 retira la
 *   caché).
 * - Nunca lanza. Sin PII en logs (ids y paths aleatorios solamente).
 */

export interface PropertyImage {
  id: string;
  propertyId: string;
  agencyId: string;
  storagePath: string;
  position: number;
  isCover: boolean;
  altText?: string;
  createdAt: string;
  /** URL pública resuelta (bucket público por CDN). */
  url: string | null;
}

interface PropertyImageRow {
  id: string;
  property_id: string;
  agency_id: string;
  storage_path: string;
  position: number;
  is_cover: boolean;
  alt_text: string | null;
  created_at: string;
}

const COLUMNS = "id,property_id,agency_id,storage_path,position,is_cover,alt_text,created_at";

function rowToImage(row: PropertyImageRow): PropertyImage {
  return {
    id: row.id,
    propertyId: row.property_id,
    agencyId: row.agency_id,
    storagePath: row.storage_path,
    position: row.position,
    isCover: row.is_cover,
    altText: row.alt_text ?? undefined,
    createdAt: row.created_at,
    url: resolvePublicUrl(GALLERY_BUCKET, row.storage_path),
  };
}

export type GalleryResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const NOT_CONFIGURED: { ok: false; error: string } = {
  ok: false,
  error: "Supabase no configurado",
};

/** Sincroniza la caché properties.cover_image. La tabla es la verdad. */
async function syncCoverCache(
  propertyId: string,
  agencyId: string,
  storagePath: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await withTimeout(
    supabase
      .from("properties")
      .update({ cover_image: storagePath })
      .eq("id", propertyId)
      .eq("agency_id", agencyId),
    6000,
    "propertyImages.syncCover",
  );
  if (error) {
    // La galería quedó bien; solo la caché de compatibilidad divergió.
    log.error("property_images", "cover cache desincronizada", {
      propertyId, code: error.code,
    });
  }
}

export async function listPropertyImages(
  propertyId: string,
  agencyId: string,
): Promise<GalleryResult<PropertyImage[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabaseAdmin();
  const { data, error } = await withTimeout(
    supabase
      .from("property_images")
      .select(COLUMNS)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    8000,
    "propertyImages.list",
  );
  if (error) {
    log.error("property_images", "list error", { propertyId, code: error.code });
    return { ok: false, error: "No se pudo leer la galería" };
  }
  return { ok: true, value: ((data as PropertyImageRow[] | null) ?? []).map(rowToImage) };
}

export interface AddImageInput {
  propertyId: string;
  agencyId: string;
  bytes: Uint8Array;
  /** Content-Type declarado por el cliente; debe coincidir con los bytes. */
  declaredType?: string;
  altText?: unknown;
}

export async function addPropertyImage(
  input: AddImageInput,
): Promise<GalleryResult<PropertyImage>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  // 1. Validación por CONTENIDO (tamaño, magic bytes, coincidencia, dimensiones).
  const inspection = inspectImageBytes(input.bytes, input.declaredType);
  if (!inspection.ok || !inspection.type) {
    return { ok: false, error: `Archivo rechazado: ${inspection.reason}` };
  }

  const supabase = getSupabaseAdmin();

  // 2. Tope operativo + próxima posición, leídos del estado real.
  const existing = await listPropertyImages(input.propertyId, input.agencyId);
  if (!existing.ok) return existing;
  if (existing.value.length >= MAX_IMAGES_PER_PROPERTY) {
    return { ok: false, error: "La propiedad alcanzó el máximo de imágenes" };
  }
  const nextPosition = existing.value.reduce((m, i) => Math.max(m, i.position + 1), 0);
  const firstImage = existing.value.length === 0;

  // 3. Path aleatorio server-side. El cliente no participa.
  const path = buildGalleryPath({
    agencyId: input.agencyId,
    propertyId: input.propertyId,
    randomName: randomUUID(),
    type: inspection.type,
  });
  if (!path) return { ok: false, error: "Identificadores inválidos" };

  // 4. Subida (upsert:false: un choque de nombre aleatorio debe fallar, no pisar).
  const uploaded = await uploadObject({
    bucket: GALLERY_BUCKET,
    path,
    file: new Blob([input.bytes as BlobPart], { type: inspection.type }),
    contentType: inspection.type,
    upsert: false,
  });
  if (!uploaded.ok) {
    log.error("property_images", "upload fallo", { propertyId: input.propertyId });
    return { ok: false, error: "No se pudo subir la imagen" };
  }

  // 5. Fila. La primera imagen de la propiedad nace como portada.
  const { data, error } = await withTimeout(
    supabase
      .from("property_images")
      .insert({
        property_id: input.propertyId,
        agency_id: input.agencyId,
        storage_path: path,
        position: nextPosition,
        is_cover: firstImage,
        alt_text: sanitizeAltText(input.altText),
      })
      .select(COLUMNS)
      .single(),
    8000,
    "propertyImages.insert",
  );

  if (error || !data) {
    // Archivo huérfano: el INSERT falló (p.ej. FK por agencia equivocada).
    log.error("property_images", "insert fallo; limpiando objeto huérfano", {
      propertyId: input.propertyId, code: error?.code ?? null,
    });
    const cleanup = await deleteObject({ bucket: GALLERY_BUCKET, path });
    if (!cleanup.ok) {
      log.error("property_images", "objeto huérfano NO limpiado (no enumerable)", {
        propertyId: input.propertyId,
      });
    }
    return { ok: false, error: "No se pudo registrar la imagen" };
  }

  if (firstImage) {
    await syncCoverCache(input.propertyId, input.agencyId, path);
  }
  return { ok: true, value: rowToImage(data as PropertyImageRow) };
}

export async function setCoverImage(
  imageId: string,
  propertyId: string,
  agencyId: string,
): Promise<GalleryResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabaseAdmin();

  // La imagen debe existir DENTRO del scope antes de tocar nada.
  const { data: target, error: readError } = await withTimeout(
    supabase
      .from("property_images")
      .select(COLUMNS)
      .eq("id", imageId)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId)
      .maybeSingle(),
    6000,
    "propertyImages.readTarget",
  );
  if (readError || !target) return { ok: false, error: "Imagen no encontrada" };

  // unset → set: el índice único parcial de 0012 prohíbe dos portadas; el
  // estado intermedio sin portada es legal y se resuelve en el set.
  const { error: unsetError } = await withTimeout(
    supabase
      .from("property_images")
      .update({ is_cover: false })
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId)
      .eq("is_cover", true),
    6000,
    "propertyImages.unsetCover",
  );
  if (unsetError) return { ok: false, error: "No se pudo actualizar la portada" };

  const { error: setError } = await withTimeout(
    supabase
      .from("property_images")
      .update({ is_cover: true })
      .eq("id", imageId)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId),
    6000,
    "propertyImages.setCover",
  );
  if (setError) {
    log.error("property_images", "set cover fallo tras unset (propiedad sin portada)", {
      propertyId, imageId, code: setError.code,
    });
    return { ok: false, error: "No se pudo asignar la portada" };
  }

  await syncCoverCache(propertyId, agencyId, (target as PropertyImageRow).storage_path);
  return { ok: true, value: undefined };
}

export async function reorderPropertyImages(
  propertyId: string,
  agencyId: string,
  requestedOrder: readonly string[],
): Promise<GalleryResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const current = await listPropertyImages(propertyId, agencyId);
  if (!current.ok) return current;

  const plan = normalizeOrder(current.value.map((i) => i.id), requestedOrder);
  const supabase = getSupabaseAdmin();
  for (const { id, position } of plan) {
    const { error } = await withTimeout(
      supabase
        .from("property_images")
        .update({ position })
        .eq("id", id)
        .eq("property_id", propertyId)
        .eq("agency_id", agencyId),
      6000,
      "propertyImages.reorder",
    );
    if (error) {
      log.error("property_images", "reorder parcial", { propertyId, code: error.code });
      return { ok: false, error: "No se pudo completar el reordenamiento" };
    }
  }
  return { ok: true, value: undefined };
}

export async function updateImageAlt(
  imageId: string,
  propertyId: string,
  agencyId: string,
  altText: unknown,
): Promise<GalleryResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabaseAdmin();
  const { data, error } = await withTimeout(
    supabase
      .from("property_images")
      .update({ alt_text: sanitizeAltText(altText) })
      .eq("id", imageId)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId)
      .select("id"),
    6000,
    "propertyImages.updateAlt",
  );
  if (error) return { ok: false, error: "No se pudo actualizar la descripción" };
  if (!data || (data as unknown[]).length === 0) return { ok: false, error: "Imagen no encontrada" };
  return { ok: true, value: undefined };
}

export async function removePropertyImage(
  imageId: string,
  propertyId: string,
  agencyId: string,
): Promise<GalleryResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabaseAdmin();

  // 1. Verificar propiedad y agencia ANTES de tocar Storage.
  const { data: target, error: readError } = await withTimeout(
    supabase
      .from("property_images")
      .select(COLUMNS)
      .eq("id", imageId)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId)
      .maybeSingle(),
    6000,
    "propertyImages.readForDelete",
  );
  if (readError || !target) return { ok: false, error: "Imagen no encontrada" };
  const row = target as PropertyImageRow;

  // 2. Primero la fila (la verdad), después el objeto.
  const { error: deleteError } = await withTimeout(
    supabase
      .from("property_images")
      .delete()
      .eq("id", imageId)
      .eq("property_id", propertyId)
      .eq("agency_id", agencyId),
    6000,
    "propertyImages.deleteRow",
  );
  if (deleteError) return { ok: false, error: "No se pudo eliminar la imagen" };

  const removed = await deleteObject({ bucket: GALLERY_BUCKET, path: row.storage_path });
  if (!removed.ok) {
    // Objeto huérfano: no referenciado, no enumerable. Queda registrado.
    log.error("property_images", "objeto huérfano tras borrar fila", { propertyId, imageId });
  }

  // 3. Si era la portada: promover la siguiente, o limpiar la caché.
  if (row.is_cover) {
    const remaining = await listPropertyImages(propertyId, agencyId);
    const next = remaining.ok ? remaining.value[0] : undefined;
    if (next) {
      const promoted = await setCoverImage(next.id, propertyId, agencyId);
      if (!promoted.ok) {
        log.error("property_images", "promoción de portada falló", { propertyId });
        await syncCoverCache(propertyId, agencyId, null);
      }
    } else {
      await syncCoverCache(propertyId, agencyId, null);
    }
  }
  return { ok: true, value: undefined };
}
