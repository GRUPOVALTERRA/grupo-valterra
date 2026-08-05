import type { AllowedImageType } from "@/lib/image-type";
import { extensionFor } from "@/lib/image-type";

/**
 * S17 — reglas PURAS de la galería de propiedades.
 *
 * Sin red, sin base: los tests las ejercitan directo y el servicio solo
 * orquesta. La AUTORIDAD de los invariantes estructurales es la migración
 * 0012 (FK compuesta, índice único parcial de portada, CHECKs).
 */

/** Bucket real existente (auditado 04-08). No se crean buckets en S17. */
export const GALLERY_BUCKET = "properties";

/** Tope operativo de fotos por propiedad (regla de producto, no de base). */
export const MAX_IMAGES_PER_PROPERTY = 20;

export const ALT_TEXT_MAX = 300;

/**
 * Roles de agencia habilitados para gestionar la galería: los MISMOS del
 * ciclo de vida de propiedades (owner/admin/agent; viewer excluido). La
 * autorización real vive en las server actions (PR2) + scoping del servicio.
 */
export const GALLERY_MANAGER_ROLES = ["owner", "admin", "agent"] as const;

export function canManageGallery(role: string): boolean {
  return (GALLERY_MANAGER_ROLES as readonly string[]).includes(role);
}

/* ------------------------------------------------------------------ */
/* Paths: SIEMPRE generados server-side, SIEMPRE aleatorios            */
/* ------------------------------------------------------------------ */

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** properties.id es TEXT en Production (p.ej. "prop-001"): forma acotada. */
const PROPERTY_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isValidAgencyId(value: string): boolean {
  return UUID_SHAPE.test(value);
}

export function isValidPropertyId(value: string): boolean {
  return PROPERTY_ID_SHAPE.test(value) && !value.includes("..");
}

/**
 * Ruta canónica: agency/{agencyId}/property/{propertyId}/{randomName}.{ext}
 *
 * - El nombre es ALEATORIO (uuid) y la extensión sale del tipo REAL
 *   detectado por contenido, no del nombre original del archivo.
 * - El cliente jamás aporta este path; cualquier path recibido de un
 *   cliente se descarta.
 * - Nombres aleatorios + bucket sin listado público = las imágenes de un
 *   borrador no son enumerables aunque el bucket sea público.
 */
export function buildGalleryPath(args: {
  agencyId: string;
  propertyId: string;
  randomName: string;
  type: AllowedImageType;
}): string | null {
  if (!isValidAgencyId(args.agencyId)) return null;
  if (!isValidPropertyId(args.propertyId)) return null;
  if (!UUID_SHAPE.test(args.randomName)) return null;
  return `agency/${args.agencyId}/property/${args.propertyId}/${args.randomName}.${extensionFor(args.type)}`;
}

/** true si el path pertenece al prefijo de esa propiedad y agencia. */
export function pathBelongsTo(path: string, agencyId: string, propertyId: string): boolean {
  return path.startsWith(`agency/${agencyId}/property/${propertyId}/`);
}

/* ------------------------------------------------------------------ */
/* Publicabilidad                                                      */
/* ------------------------------------------------------------------ */

/**
 * La galería pública SOLO se renderiza para propiedades publicadas.
 * draft, unpublished y archived no exponen imágenes (la página pública ya
 * 404ea esos estados; esta regla es la guarda del componente).
 */
export function isGalleryPubliclyVisible(status: string): boolean {
  return status === "published";
}

/* ------------------------------------------------------------------ */
/* Orden y alt                                                         */
/* ------------------------------------------------------------------ */

export function sanitizeAltText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, ALT_TEXT_MAX);
}

/**
 * Normaliza un reordenamiento: posiciones 0..n-1 según el orden recibido.
 * Ids desconocidos se ignoran; los faltantes conservan su orden relativo al
 * final. Nunca produce posiciones negativas ni huecos.
 */
export function normalizeOrder(
  currentIds: readonly string[],
  requestedOrder: readonly string[],
): { id: string; position: number }[] {
  const current = new Set(currentIds);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of requestedOrder) {
    if (current.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of currentIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered.map((id, position) => ({ id, position }));
}
