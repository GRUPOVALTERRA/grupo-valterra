import { verifyImageStructure } from "@/lib/image-decode";

/**
 * S17 — identificación de imágenes por CONTENIDO (magic bytes) + dimensiones.
 *
 * Helper PURO: sin red, sin base, sin File APIs. Opera sobre bytes.
 *
 * Por qué por contenido: la extensión y el Content-Type los declara el
 * cliente y se falsifican trivialmente. Un "foto.jpg" con bytes de SVG es un
 * vector de XSS almacenado si el bucket lo sirve. Acá el tipo REAL sale de
 * los primeros bytes, y si no coincide con lo declarado, se rechaza.
 *
 * SVG queda rechazado por diseño: no está en la allowlist y su firma
 * (texto XML) no es reconocida como imagen.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Alineado con el bucket real `properties` (5 MiB, auditado 04-08). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8000;
export const MIN_IMAGE_DIMENSION = 200;

const EXTENSION: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(type: AllowedImageType): string {
  return EXTENSION[type];
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let out = "";
  for (let i = start; i < start + len && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Detecta el tipo REAL por magic bytes. null = no es un formato permitido
 * (incluye SVG, GIF, BMP, PDF, HTML y cualquier otra cosa).
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

function readU32BE(b: Uint8Array, o: number): number {
  return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}
function readU16BE(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function readU24LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}
function readU16LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function pngDimensions(b: Uint8Array): ImageDimensions | null {
  // IHDR es el primer chunk: width/height en offsets 16/20.
  if (b.length < 24) return null;
  if (ascii(b, 12, 4) !== "IHDR") return null;
  return { width: readU32BE(b, 16), height: readU32BE(b, 20) };
}

function jpegDimensions(b: Uint8Array): ImageDimensions | null {
  // Se recorren los segmentos hasta un SOFn (C0..CF, salvo C4/C8/CC).
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    const len = readU16BE(b, o + 2);
    if (len < 2) return null;
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      return { height: readU16BE(b, o + 5), width: readU16BE(b, o + 7) };
    }
    o += 2 + len;
  }
  return null;
}

function webpDimensions(b: Uint8Array): ImageDimensions | null {
  const fourcc = ascii(b, 12, 4);
  if (fourcc === "VP8X" && b.length >= 30) {
    return { width: readU24LE(b, 24) + 1, height: readU24LE(b, 27) + 1 };
  }
  if (fourcc === "VP8 " && b.length >= 30) {
    return { width: readU16LE(b, 26) & 0x3fff, height: readU16LE(b, 28) & 0x3fff };
  }
  if (fourcc === "VP8L" && b.length >= 25) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Dimensiones desde los headers. null si el archivo está malformado. */
export function parseImageDimensions(
  bytes: Uint8Array,
  type: AllowedImageType,
): ImageDimensions | null {
  if (type === "image/png") return pngDimensions(bytes);
  if (type === "image/jpeg") return jpegDimensions(bytes);
  return webpDimensions(bytes);
}

export interface ImageInspection {
  ok: boolean;
  type?: AllowedImageType;
  dimensions?: ImageDimensions;
  /** Categoría saneada del rechazo (nunca contenido del archivo). */
  reason?:
    | "empty"
    | "too-large"
    | "unrecognized-content"
    | "type-mismatch"
    | "unreadable-dimensions"
    | "dimensions-out-of-range"
    | "not-decodable";
}

/**
 * Inspección completa y ÚNICO punto de entrada de validación: tamaño + tipo
 * por contenido + coincidencia con lo declarado + INTEGRIDAD ESTRUCTURAL del
 * contenedor completo + dimensiones dentro de rango.
 *
 * NUNCA confía en la extensión ni en el Content-Type. Deliberadamente no
 * existe una variante "rápida" sin verificación estructural: un segundo punto
 * de entrada más débil terminaría usándose por error en algún camino.
 */
export function inspectImageBytes(
  bytes: Uint8Array,
  declaredType: string | undefined,
): ImageInspection {
  if (!bytes || bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too-large" };

  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, reason: "unrecognized-content" };

  // Si el cliente declaró un tipo, debe coincidir con los bytes reales.
  if (declaredType && declaredType !== sniffed) {
    return { ok: false, reason: "type-mismatch" };
  }

  // S17 PR2: el contenedor debe estar íntegro de principio a fin. Rechaza
  // truncados, polyglots y basura pegada después del fin de la imagen.
  if (!verifyImageStructure(bytes, sniffed).ok) {
    return { ok: false, reason: "not-decodable" };
  }

  const dims = parseImageDimensions(bytes, sniffed);
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    return { ok: false, reason: "unreadable-dimensions" };
  }
  if (
    dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION ||
    dims.width < MIN_IMAGE_DIMENSION || dims.height < MIN_IMAGE_DIMENSION
  ) {
    return { ok: false, reason: "dimensions-out-of-range" };
  }

  return { ok: true, type: sniffed, dimensions: dims };
}
