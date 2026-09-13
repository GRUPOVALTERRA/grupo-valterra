import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { uploadObject, deleteObject } from "@/lib/storage";
import { extensionFor, inspectImageBytes } from "@/lib/image-type";
import {
  agencyLogoStoragePath,
  checkLogoBytes,
  checkLogoDimensions,
  isAgencyLogoPath,
  type LogoRejection,
} from "@/lib/agency-logo";
import { invalidateAgencyBadgeCache } from "@/services/agency-badges";

/**
 * S26-MAP-02 — escritura del logo miniatura de una agencia.
 *
 * Contrato: `agencyId` lo resuelve la server action desde la sesion y
 * el rol; este servicio jamas recibe un id elegido por el navegador.
 *
 * Orden de operaciones (deliberado):
 *   1. validar bytes (inspectImageBytes, unico punto de entrada) +
 *      reglas de logo (mas estrictas);
 *   2. subir el objeto NUEVO con nombre aleatorio;
 *   3. apuntar `agencies.logo_url` al nuevo path;
 *   4. recien entonces borrar el objeto viejo (best effort).
 * Si algo falla en 3, el objeto viejo sigue vivo y la fila sigue
 * apuntando a el: el sitio nunca queda con un logo roto.
 */

const BUCKET = "properties";

export type SetAgencyLogoResult =
  | { ok: true; path: string }
  | { ok: false; code: "rejected" | "unavailable" | "storage-failed" | "db-failed"; reason?: LogoRejection | string };

interface LogoRow {
  logo_url: string | null;
}

async function readCurrentLogoPath(agencyId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await withTimeout(
    supabase.from("agencies").select("logo_url").eq("id", agencyId).maybeSingle<LogoRow>(),
    4000,
    "agencies.logo.current",
  );
  return data?.logo_url ?? null;
}

async function writeLogoPath(agencyId: string, path: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await withTimeout(
    supabase.from("agencies").update({ logo_url: path }).eq("id", agencyId),
    6000,
    "agencies.logo.update",
  );
  if (error) {
    log.error("agency-logo", "update error", { agencyId, code: error.code ?? "unknown" });
    return false;
  }
  return true;
}

async function deleteOldLogo(oldPath: string | null): Promise<void> {
  // Solo se borra lo que tiene forma de logo nuestro; nunca un path
  // arbitrario que alguien haya dejado en la columna.
  if (!isAgencyLogoPath(oldPath)) return;
  const res = await deleteObject({ bucket: BUCKET, path: oldPath });
  if (!res.ok) log.warn("agency-logo", "no se pudo borrar el logo anterior", { path: oldPath });
}

export async function setAgencyLogo(args: {
  agencyId: string;
  bytes: Uint8Array;
  declaredType?: string;
  updatedBy?: string | null;
}): Promise<SetAgencyLogoResult> {
  if (!args.agencyId) return { ok: false, code: "rejected", reason: "agencyId" };
  if (!isSupabaseConfigured()) return { ok: false, code: "unavailable" };

  const heavy = checkLogoBytes(args.bytes.length);
  if (heavy) return { ok: false, code: "rejected", reason: heavy };

  const inspection = inspectImageBytes(args.bytes, args.declaredType);
  if (!inspection.ok || !inspection.type || !inspection.dimensions) {
    return { ok: false, code: "rejected", reason: inspection.reason ?? "unrecognized-content" };
  }
  const dims = checkLogoDimensions(inspection.dimensions);
  if (dims) return { ok: false, code: "rejected", reason: dims };

  try {
    const oldPath = await readCurrentLogoPath(args.agencyId);
    const path = agencyLogoStoragePath(args.agencyId, randomUUID(), extensionFor(inspection.type));

    const uploaded = await uploadObject({
      bucket: BUCKET,
      path,
      file: new Blob([args.bytes as BlobPart], { type: inspection.type }),
      contentType: inspection.type,
      upsert: false,
    });
    if (!uploaded.ok) return { ok: false, code: "storage-failed" };

    const written = await writeLogoPath(args.agencyId, path);
    if (!written) {
      // La fila sigue apuntando al logo viejo: limpiar el objeto huerfano.
      await deleteObject({ bucket: BUCKET, path });
      return { ok: false, code: "db-failed" };
    }

    await deleteOldLogo(oldPath);
    invalidateAgencyBadgeCache();

    log.info("agency-logo", "logo actualizado", {
      agencyId: args.agencyId,
      type: inspection.type,
      width: inspection.dimensions.width,
      height: inspection.dimensions.height,
      updatedBy: args.updatedBy ?? "unknown",
    });
    return { ok: true, path };
  } catch (err) {
    log.error("agency-logo", "setAgencyLogo exception", {
      kind: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, code: "storage-failed" };
  }
}

export async function removeAgencyLogo(args: {
  agencyId: string;
  updatedBy?: string | null;
}): Promise<{ ok: boolean }> {
  if (!args.agencyId || !isSupabaseConfigured()) return { ok: false };
  try {
    const oldPath = await readCurrentLogoPath(args.agencyId);
    const written = await writeLogoPath(args.agencyId, null);
    if (!written) return { ok: false };
    await deleteOldLogo(oldPath);
    invalidateAgencyBadgeCache();
    log.info("agency-logo", "logo eliminado", {
      agencyId: args.agencyId,
      updatedBy: args.updatedBy ?? "unknown",
    });
    return { ok: true };
  } catch (err) {
    log.error("agency-logo", "removeAgencyLogo exception", {
      kind: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false };
  }
}
