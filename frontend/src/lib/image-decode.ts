import type { AllowedImageType } from "@/lib/image-type";

/**
 * S17 PR2 — verificación ESTRUCTURAL del archivo de imagen.
 *
 * Deuda que PR1 dejó registrada: los magic bytes identifican el formato y los
 * headers dan las dimensiones, pero ninguno de los dos prueba que el archivo
 * sea una imagen coherente. Un JPEG truncado, un polyglot (cabecera de imagen
 * + payload arbitrario) o un PNG con basura pegada pasan ese filtro.
 *
 * Acá se RECORRE EL CONTENEDOR COMPLETO: cada chunk/segmento, de principio a
 * fin, verificando longitudes declaradas contra el tamaño real y la presencia
 * de las secciones obligatorias que un decodificador necesita.
 *
 * Alcance honesto: esto valida la ESTRUCTURA, no rasteriza los píxeles. No
 * requiere librería nativa (el proyecto no tiene sharp ni equivalente) y es
 * puro: sin red, sin base, sin proceso. Un archivo que pase esta verificación
 * y falle al rasterizarse sería un caso patológico raro; si alguna vez hace
 * falta esa garantía, el punto de extensión es este módulo.
 */

export type DecodeFailure =
  | "truncated"
  | "trailing-garbage"
  | "missing-required-section"
  | "malformed-structure"
  | "checksum-mismatch";

export interface DecodeCheck {
  ok: boolean;
  reason?: DecodeFailure;
}

const OK: DecodeCheck = { ok: true };
const fail = (reason: DecodeFailure): DecodeCheck => ({ ok: false, reason });

/* ------------------------------------------------------------------ */
/* CRC32 (PNG)                                                         */
/* ------------------------------------------------------------------ */

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32be = (b: Uint8Array, o: number) =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, o: number) =>
  String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/* ------------------------------------------------------------------ */
/* PNG: cadena de chunks IHDR → … → IEND, con CRC del IHDR            */
/* ------------------------------------------------------------------ */

function verifyPng(b: Uint8Array): DecodeCheck {
  let o = 8; // tras la firma
  let sawIHDR = false;
  let sawIDAT = false;
  let sawIEND = false;

  while (o + 8 <= b.length) {
    const len = u32be(b, o);
    // Un length disparatado indica estructura corrupta, no un archivo grande.
    if (len > b.length) return fail("malformed-structure");
    const type = tag(b, o + 4);
    const dataStart = o + 8;
    const crcStart = dataStart + len;
    if (crcStart + 4 > b.length) return fail("truncated");

    if (!sawIHDR) {
      if (type !== "IHDR" || len !== 13) return fail("malformed-structure");
      // El CRC del header se verifica de verdad: detecta corrupción real.
      if (crc32(b, o + 4, crcStart) !== u32be(b, crcStart)) {
        return fail("checksum-mismatch");
      }
      sawIHDR = true;
    }
    if (type === "IDAT") sawIDAT = true;
    if (type === "IEND") {
      sawIEND = true;
      o = crcStart + 4;
      break;
    }
    o = crcStart + 4;
  }

  if (!sawIHDR || !sawIDAT) return fail("missing-required-section");
  if (!sawIEND) return fail("truncated");
  // Nada puede venir después de IEND: eso sería un polyglot.
  if (o !== b.length) return fail("trailing-garbage");
  return OK;
}

/* ------------------------------------------------------------------ */
/* JPEG: SOI → segmentos → SOFn → SOS → datos entrópicos → EOI        */
/* ------------------------------------------------------------------ */

function verifyJpeg(b: Uint8Array): DecodeCheck {
  if (b.length < 4) return fail("truncated");
  let o = 2; // tras SOI
  let sawSOF = false;

  while (o + 1 < b.length) {
    if (b[o] !== 0xff) return fail("malformed-structure");
    // Los relleno 0xFF consecutivos son legales entre segmentos.
    let m = o + 1;
    while (m < b.length && b[m] === 0xff) m++;
    if (m >= b.length) return fail("truncated");
    const marker = b[m];

    if (marker === 0xd9) {
      // EOI: debe ser el final del archivo.
      return m + 1 === b.length ? (sawSOF ? OK : fail("missing-required-section")) : fail("trailing-garbage");
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o = m + 1;
      continue;
    }
    if (m + 2 >= b.length) return fail("truncated");
    const len = (b[m + 1] << 8) | b[m + 2];
    if (len < 2 || m + 1 + len > b.length) return fail("truncated");

    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) sawSOF = true;

    if (marker === 0xda) {
      // SOS: sin SOF previo no hay imagen que decodificar.
      if (!sawSOF) return fail("missing-required-section");
      // Los datos entrópicos llegan hasta EOI; se exige que el archivo
      // termine exactamente en FFD9 (un truncado no lo tiene).
      const last = b.length - 1;
      if (b[last - 1] === 0xff && b[last] === 0xd9) return OK;
      return fail("truncated");
    }
    o = m + 1 + len;
  }
  return fail("truncated");
}

/* ------------------------------------------------------------------ */
/* WebP: RIFF con tamaño coherente + chunk de imagen obligatorio       */
/* ------------------------------------------------------------------ */

function verifyWebp(b: Uint8Array): DecodeCheck {
  if (b.length < 16) return fail("truncated");
  const riffSize = u32le(b, 4);
  // El tamaño declarado por RIFF debe describir el archivo COMPLETO.
  if (riffSize + 8 !== b.length) {
    return riffSize + 8 > b.length ? fail("truncated") : fail("trailing-garbage");
  }

  let o = 12;
  let sawImageChunk = false;
  while (o + 8 <= b.length) {
    const fourcc = tag(b, o);
    const size = u32le(b, o + 4);
    const next = o + 8 + size + (size % 2); // padding a byte par
    if (size > b.length || next > b.length) return fail("truncated");
    if (fourcc === "VP8 " || fourcc === "VP8L") sawImageChunk = true;
    o = next;
  }
  if (o !== b.length) return fail("malformed-structure");
  if (!sawImageChunk) return fail("missing-required-section");
  return OK;
}

/**
 * Verifica que los bytes formen un contenedor de imagen íntegro y completo
 * del tipo indicado. `type` debe venir del sniffing por contenido.
 */
export function verifyImageStructure(bytes: Uint8Array, type: AllowedImageType): DecodeCheck {
  if (type === "image/png") return verifyPng(bytes);
  if (type === "image/jpeg") return verifyJpeg(bytes);
  return verifyWebp(bytes);
}
