import { MAX_IMAGES_PER_PROPERTY } from "@/lib/property-gallery";

/**
 * S17 PR2 — contrato de resultado de las acciones de galería.
 *
 * Vive fuera del módulo "use server" porque allí TODO export debe ser una
 * función async: un objeto de mensajes exportado desde las actions rompe el
 * build de Next. Además, así el cliente importa sólo texto, sin arrastrar
 * las actions a bundles donde no hacen falta.
 *
 * Contrato CERRADO: la UI decide por código, nunca por texto libre, y ningún
 * error crudo de Storage o de la base llega al usuario.
 */

export type GalleryErrorCode =
  | "forbidden"
  | "not-found"
  | "invalid-input"
  | "rate-limited"
  | "too-many-images"
  | "rejected-file"
  | "storage-failed"
  | "unavailable";

export type GalleryActionResult =
  | { ok: true; uploaded?: number; skipped?: number }
  | { ok: false; code: GalleryErrorCode };

export const GALLERY_ERROR_MESSAGES: Record<GalleryErrorCode, string> = {
  forbidden: "No tenés permisos para administrar las imágenes de esta propiedad.",
  "not-found": "No se encontró la propiedad o la imagen.",
  "invalid-input": "Los datos enviados no son válidos.",
  "rate-limited": "Demasiadas cargas seguidas. Esperá un momento y reintentá.",
  "too-many-images": `La propiedad alcanzó el máximo de ${MAX_IMAGES_PER_PROPERTY} imágenes.`,
  "rejected-file":
    "El archivo no es una imagen válida (JPG, PNG o WebP, hasta 5 MB, entre 200 y 8000 px).",
  "storage-failed": "No se pudo completar la operación sobre la imagen. Reintentá.",
  unavailable: "El almacenamiento no está disponible en este momento.",
};
