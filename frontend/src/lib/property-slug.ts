/**
 * Generación de slug de propiedades — Sprint 15-A.
 *
 * El slug se deriva SIEMPRE server-side desde el título: el cliente no puede
 * elegirlo. Es la clave pública de la propiedad (`/propiedades/<slug>`) y tiene
 * un índice único en la base, así que su forma no puede depender de lo que
 * mande el navegador.
 */

/** Longitud máxima del slug base, dejando lugar al sufijo de colisión. */
const MAX_BASE = 80;

/**
 * Normaliza un texto a slug: minúsculas, sin acentos, sin caracteres raros,
 * separado por guiones y sin guiones repetidos ni en los extremos.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/g, "");
}

/**
 * Resuelve el slug definitivo evitando colisiones de forma determinística:
 * `casa-en-parana`, `casa-en-parana-2`, `casa-en-parana-3`, …
 *
 * `taken` son los slugs ya existentes que empiezan con la base.
 * Determinística = ante el mismo título y el mismo conjunto ocupado, siempre
 * devuelve lo mismo (sin random ni timestamps).
 */
export function resolveSlug(title: string, taken: Iterable<string>): string {
  const base = slugify(title) || "propiedad";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No se pudo resolver un slug libre");
}
