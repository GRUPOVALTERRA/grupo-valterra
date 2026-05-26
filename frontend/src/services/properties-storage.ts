import {
  uploadObject,
  deleteObject,
  resolvePublicUrl,
  validateImageFile,
  type UploadResult,
  type UploadError,
} from "@/lib/storage";

/**
 * Vertical wrapper for property image storage.
 *
 * Sprint 11 MF1: primitive only. DOES NOT update the properties table.
 * Caller (MF2/MF4) is responsible for persisting `path` into
 * properties.cover_image or properties.gallery[].
 *
 * Path convention:
 *   - cover:   <agency_id>/<property_id>/cover.webp
 *   - gallery: <agency_id>/<property_id>/gallery/NN.webp  (NN = 00..99)
 *
 * MF1 known limitation: files are stored with .webp extension regardless of
 * input MIME. Actual bytes match input MIME. Client-side canvas resize +
 * true webp conversion deferred to MF4.
 */

const BUCKET = "properties";

export type PropertyImageKind = "cover" | "gallery";

export interface UploadPropertyImageInput {
  agencyId: string;
  propertyId: string;
  kind: PropertyImageKind;
  /** Required for gallery (0..99). Ignored for cover. */
  index?: number;
  file: File | Blob;
  /** Defaults to file.type if File-like, else image/jpeg. */
  contentType?: string;
}

function buildPath(
  agencyId: string,
  propertyId: string,
  kind: PropertyImageKind,
  index?: number,
): string {
  if (kind === "cover") {
    return `${agencyId}/${propertyId}/cover.webp`;
  }
  const i = typeof index === "number" && index >= 0 ? Math.floor(index) : 0;
  const padded = String(i).padStart(2, "0");
  return `${agencyId}/${propertyId}/gallery/${padded}.webp`;
}

function inferContentType(file: File | Blob, fallback?: string): string {
  const fileType = (file as Partial<File>).type;
  if (fileType && typeof fileType === "string" && fileType.length > 0) return fileType;
  return fallback ?? "image/jpeg";
}

/**
 * Upload a property image. Validates MIME + size, then uploads via SERVICE_ROLE.
 * Returns UploadResult on success, UploadError on failure. NEVER throws.
 */
export async function uploadPropertyImage(
  input: UploadPropertyImageInput,
): Promise<UploadResult | UploadError> {
  if (!input.agencyId || !input.propertyId) {
    return { ok: false, error: "agencyId y propertyId son requeridos" };
  }
  const contentType = input.contentType ?? inferContentType(input.file);
  const size = (input.file as Blob).size;
  const validation = validateImageFile({ size, type: contentType });
  if (!validation.valid) {
    return { ok: false, error: validation.error ?? "validacion fallida" };
  }
  const path = buildPath(input.agencyId, input.propertyId, input.kind, input.index);
  return uploadObject({
    bucket: BUCKET,
    path,
    file: input.file,
    contentType,
    upsert: true,
  });
}

/**
 * Delete a property image by path. Returns { ok, error? }.
 */
export async function deletePropertyImage(
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!path) return { ok: false, error: "path requerido" };
  return deleteObject({ bucket: BUCKET, path });
}

/**
 * Resolve public URL for a property image path. Returns null if not configured.
 */
export function getPropertyImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return resolvePublicUrl(BUCKET, path);
}
