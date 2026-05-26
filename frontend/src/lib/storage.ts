import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * Generic Supabase Storage helpers - Sprint 11 MF1.
 *
 * Primitive upload/delete/resolveUrl. SERVICE_ROLE bypass RLS.
 *
 * Bucket policy: target bucket "properties" is PUBLIC. Only paths destined
 * to publishable content should receive uploads. URLs are not guessable
 * (UUID v4) but also NOT private. Signed URLs deferred.
 *
 * CORE candidate (OS v1 L2): promotion to src/platform/storage/ deferred
 * until 2nd consumer appears.
 */

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  ok: true;
  path: string;
  publicUrl: string;
}

export interface UploadError {
  ok: false;
  error: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Pure TS validator. Safe in client or server. No I/O.
 */
export function validateImageFile(file: { size: number; type: string }): ValidationResult {
  if (!file) return { valid: false, error: "Archivo requerido" };
  if (typeof file.size !== "number" || file.size <= 0) {
    return { valid: false, error: "Archivo vacio" };
  }
  if (file.size > MAX_BYTES) {
    return { valid: false, error: `Archivo excede ${MAX_BYTES / 1024 / 1024}MB` };
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return { valid: false, error: `MIME no permitido: ${file.type}` };
  }
  return { valid: true };
}

async function toArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

/**
 * Upload a file to a Supabase Storage bucket at the given path.
 * Uses SERVICE_ROLE. Caller responsible for path safety + caller validation.
 * Returns UploadResult on success, UploadError on failure. NEVER throws.
 */
export async function uploadObject(args: {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType: string;
  upsert?: boolean;
}): Promise<UploadResult | UploadError> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado" };
  }
  try {
    const supabase = getSupabaseAdmin();
    const buf = await toArrayBuffer(args.file);
    const { data, error } = await supabase.storage
      .from(args.bucket)
      .upload(args.path, buf, {
        contentType: args.contentType,
        upsert: args.upsert ?? true,
      });
    if (error || !data) {
      log.error("storage", "upload error", {
        bucket: args.bucket,
        path: args.path,
        message: error?.message ?? "no data returned",
      });
      return { ok: false, error: error?.message ?? "upload failed" };
    }
    const { data: pub } = supabase.storage.from(args.bucket).getPublicUrl(data.path);
    return { ok: true, path: data.path, publicUrl: pub.publicUrl };
  } catch (err) {
    log.error("storage", "upload exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Delete a file from a Supabase Storage bucket.
 * Returns { ok, error? }. NEVER throws.
 */
export async function deleteObject(args: {
  bucket: string;
  path: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado" };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(args.bucket).remove([args.path]);
    if (error) {
      log.error("storage", "delete error", {
        bucket: args.bucket,
        path: args.path,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    log.error("storage", "delete exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Resolve the public URL for a stored object. Does NOT verify existence.
 * Returns null if Supabase not configured.
 */
export function resolvePublicUrl(bucket: string, path: string): string | null {
  if (!isSupabaseConfigured() || !path) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}
