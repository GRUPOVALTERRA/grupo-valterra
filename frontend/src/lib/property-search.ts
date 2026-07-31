/**
 * Búsqueda del listado administrativo — Sprint 15-B.
 *
 * El panel busca por texto libre sobre los campos con los que un operador
 * identifica una propiedad: título, slug, ciudad y barrio. El precio, el estado
 * o el tipo NO entran acá: para eso están los filtros, que son exactos.
 *
 * La búsqueda se resuelve en la base cuando hay base, y en memoria cuando el
 * servicio cae al snapshot. Este módulo concentra las dos formas para que no se
 * separen: mismas columnas, mismo recorte del término.
 */

/**
 * Tope de longitud del término.
 *
 * Corta URLs desmedidas y patrones `LIKE` que obliguen a la base a recorrer
 * texto largo sin necesidad. Nadie identifica una propiedad con más de esto.
 */
export const SEARCH_MAX_LENGTH = 60;

/** Columnas de la base sobre las que busca el panel. */
export const SEARCH_COLUMNS = ["title", "slug", "city", "neighborhood"] as const;

/**
 * Limpia el término entrante: recorta espacios, colapsa los repetidos y aplica
 * el tope. Devuelve `undefined` cuando no queda nada útil, para que quien llama
 * pueda tratar "sin búsqueda" y "búsqueda vacía" como lo mismo.
 */
export function normalizeSearchTerm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH).trim();
  return clean.length > 0 ? clean : undefined;
}

/** Minúsculas y sin acentos: quien escribe "parana" espera encontrar "Paraná". */
function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase();
}

/** Forma mínima que necesita el matcher en memoria. */
export interface SearchableProperty {
  title?: string | null;
  slug?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}

/**
 * ¿La propiedad coincide con el término? Sin acentos y sin distinguir
 * mayúsculas, por subcadena.
 *
 * Es el equivalente en memoria del `ilike` que se manda a la base. La única
 * diferencia conocida: Postgres sí distingue acentos (no hay `unaccent` en el
 * esquema), así que en base "parana" no encuentra "Paraná". Acá sí. La
 * asimetría juega a favor del operador y no cambia qué filas puede ver.
 */
export function matchesSearch(property: SearchableProperty, term: string): boolean {
  const needle = fold(term.trim());
  if (!needle) return true;
  return [property.title, property.slug, property.city, property.neighborhood].some(
    (value) => typeof value === "string" && fold(value).includes(needle),
  );
}

/**
 * Valor listo para un filtro `ilike` de PostgREST.
 *
 * Va entre comillas dobles porque el término viaja dentro de un `or=(...)`: una
 * coma o un paréntesis sueltos cortarían la expresión y el resto del texto
 * pasaría a leerse como otro filtro. Dentro de las comillas sólo hay que
 * escapar la comilla y la barra invertida.
 *
 * `%`, `_` y `*` quedan como comodines del propio `LIKE` — PostgREST no expone
 * cláusula `ESCAPE`. Ensanchan la búsqueda del que los escribe y nada más: no
 * alcanzan filas fuera del scope, que lo acota el `WHERE agency_id`.
 */
export function toIlikeFilterValue(term: string): string {
  const escaped = term.replace(/[\\"]/g, (char) => `\\${char}`);
  return `"%${escaped}%"`;
}

/** Expresión `or` de PostgREST que cubre todas las columnas buscables. */
export function buildSearchOrFilter(term: string): string {
  const value = toIlikeFilterValue(term);
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.${value}`).join(",");
}
