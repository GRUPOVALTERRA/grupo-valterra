/**
 * Fixtures de bytes de imagen — INVENTADOS, mínimos pero ESTRUCTURALMENTE
 * VÁLIDOS (S17 PR2). No hay archivos reales en el repo ni descargas.
 *
 * Los builders producen contenedores íntegros: PNG con IHDR (CRC real) +
 * IDAT + IEND, JPEG con SOF0 + SOS + EOI, WebP con RIFF coherente + VP8.
 * Las variantes corruptas sirven para probar el rechazo.
 *
 * El CRC32 se implementa acá aparte, para no validar la implementación
 * contra sí misma.
 */

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const be32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
const le32 = (n: number) =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([ascii(type), data]);
  return concat([be32(data.length), typed, be32(crc32(typed))]);
}

/** PNG completo: firma + IHDR + IDAT + IEND. */
export function validPng(width: number, height: number): Uint8Array {
  const ihdr = concat([
    be32(width),
    be32(height),
    new Uint8Array([8, 6, 0, 0, 0]), // bit depth, color type, compression, filter, interlace
  ]);
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** JPEG completo: SOI + SOF0 + SOS + datos + EOI. */
export function validJpeg(width: number, height: number): Uint8Array {
  const sof = concat([
    new Uint8Array([0xff, 0xc0, 0x00, 0x11, 0x08]),
    new Uint8Array([(height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff]),
    new Uint8Array([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
  ]);
  return concat([
    new Uint8Array([0xff, 0xd8]),
    sof,
    new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    new Uint8Array([0x12, 0x34, 0x56]), // datos entrópicos simulados
    new Uint8Array([0xff, 0xd9]),
  ]);
}

/** WebP completo: RIFF coherente + chunk VP8 con dimensiones. */
export function validWebp(width: number, height: number): Uint8Array {
  const data = new Uint8Array(14);
  data.set([0x9d, 0x01, 0x2a], 3); // start code del keyframe VP8
  data[6] = width & 0xff;
  data[7] = (width >> 8) & 0x3f;
  data[8] = height & 0xff;
  data[9] = (height >> 8) & 0x3f;
  const body = concat([ascii("WEBP"), ascii("VP8 "), le32(data.length), data]);
  return concat([ascii("RIFF"), le32(body.length), body]);
}

/* ---------------- variantes inválidas ---------------- */

/** SVG: nunca es aceptable (vector de XSS almacenado). */
export const svgBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

export const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body>x</body></html>");
export const pdfBytes = new TextEncoder().encode("%PDF-1.4 objeto falso");

/** PNG cortado antes de IEND: cabecera válida, archivo incompleto. */
export function truncatedPng(width = 800, height = 600): Uint8Array {
  return validPng(width, height).slice(0, 40);
}

/** PNG íntegro con basura pegada al final (polyglot). */
export function pngWithTrailingGarbage(): Uint8Array {
  return concat([validPng(800, 600), new TextEncoder().encode("<?php echo 1; ?>")]);
}

/** PNG con el CRC del IHDR alterado. */
export function pngWithBadCrc(): Uint8Array {
  const b = validPng(800, 600);
  b[29] ^= 0xff; // último byte del CRC de IHDR
  return b;
}

/** JPEG sin EOI: se corta en medio de los datos. */
export function truncatedJpeg(): Uint8Array {
  const b = validJpeg(800, 600);
  return b.slice(0, b.length - 2);
}

/** WebP cuyo tamaño declarado por RIFF no coincide con el archivo. */
export function webpWithBadRiffSize(): Uint8Array {
  const b = validWebp(640, 480);
  b[4] = (b[4] + 9) & 0xff;
  return b;
}

/** Cabecera de imagen válida seguida de payload arbitrario, sin estructura. */
export function pngHeaderOnly(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...new TextEncoder().encode("payload arbitrario que no es una imagen"),
  ]);
}
