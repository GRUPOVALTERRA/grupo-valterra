import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Helpers para guardas que leen migraciones SQL (OPS-09).
 *
 * Problema que resuelven: una guarda que fija "la migracion 0017" se pone
 * roja apenas una migracion posterior (0018, 0019, ...) redefine la misma
 * constraint. El contrato real es "la ULTIMA migracion que (re)define la
 * constraint X contiene la allowlist completa", no un numero.
 *
 * Se mira solo SQL ejecutable: los comentarios (`-- ...`, `/* ... *\/`)
 * suelen documentar el estado ANTERIOR o el rollback y darian falso match.
 */

export const MIGRATIONS_DIR = "supabase/migrations";

/** SQL sin comentarios de linea ni de bloque. */
export const sqlOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

/** Nombres de migracion (ordenados por prefijo numerico = orden de aplicacion). */
export const listMigrations = (root: string) =>
  readdirSync(join(root, MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

/**
 * Ultima migracion cuyo SQL ejecutable (re)define `constraint`.
 * Devuelve nombre y contenido; lanza si ninguna la define (la guarda debe
 * fallar ruidosamente, no pasar por omision).
 */
export const latestMigrationDefining = (root: string, constraint: string) => {
  const re = new RegExp(`add\\s+constraint\\s+${constraint}\\b`, "i");
  const hits = listMigrations(root).filter((f) =>
    re.test(sqlOf(readFileSync(join(root, MIGRATIONS_DIR, f), "utf8"))),
  );
  if (hits.length === 0) throw new Error(`ninguna migracion define ${constraint}`);
  const file = hits[hits.length - 1];
  return { file, sql: readFileSync(join(root, MIGRATIONS_DIR, file), "utf8") };
};
