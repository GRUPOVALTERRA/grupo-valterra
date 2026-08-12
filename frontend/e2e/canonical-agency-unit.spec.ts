import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_AGENCY_SLUG, LEGACY_AGENCY_SLUG } from "../src/services/agencies";

/**
 * S20.5 — identidad del tenant canónico.
 *
 * Production tenía dos filas llamadas "Grupo Valterra". `getValterraAgency()`
 * resolvía la del seed original (`valterra`, 24-05), mientras la propiedad
 * publicada, sus imágenes, el único lead real y el único evento de analítica
 * colgaban de la otra (`grupovalterra`, 07-08).
 *
 * El efecto visible fue `/admin/estadisticas` mostrando cero actividad propia
 * pese a haberla: el scoping filtraba correctamente por la agencia del
 * contexto, y la agencia del contexto era la vacía.
 *
 * Estas guardas existen para que el lookup no vuelva a apuntar al seed.
 */

const SRC = readFileSync(
  join(__dirname, "../src/services/agencies.ts"),
  "utf8",
);

/** Código ejecutable: sin comentarios (que sí mencionan el slug legacy). */
const codigo = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .map((l) => l.replace(/\s\/\/.*$/, ""))
  .join("\n");

test.describe("agencia canónica", () => {
  test("el slug canónico es grupovalterra", () => {
    expect(CANONICAL_AGENCY_SLUG).toBe("grupovalterra");
  });

  test("el slug del seed original queda documentado como legacy", () => {
    expect(LEGACY_AGENCY_SLUG).toBe("valterra");
    expect(CANONICAL_AGENCY_SLUG).not.toBe(LEGACY_AGENCY_SLUG);
  });

  test("getValterraAgency consulta por la constante, no por un literal", () => {
    expect(codigo).toContain('.eq("slug", CANONICAL_AGENCY_SLUG)');
  });

  test("el lookup ya NO resuelve la agencia legacy", () => {
    // Ningún `.eq("slug", "valterra")` puede volver al código ejecutable.
    expect(codigo).not.toMatch(/\.eq\(\s*["']slug["']\s*,\s*["']valterra["']\s*\)/);
    // Ni el literal suelto en una query.
    expect(codigo).not.toMatch(/eq\([^)]*["']valterra["']/);
  });

  test("LEGACY_AGENCY_SLUG solo se declara: nunca se usa para consultar", () => {
    const usos = [...codigo.matchAll(/LEGACY_AGENCY_SLUG/g)].length;
    // Una única aparición: la declaración de la constante.
    expect(usos).toBe(1);
    expect(codigo).not.toMatch(/eq\([^)]*LEGACY_AGENCY_SLUG/);
  });

  test("se conserva el cache y el comportamiento fail-soft", () => {
    // El hotfix no debe alterar la semántica de la función.
    expect(codigo).toContain("if (cachedValterra) return cachedValterra");
    expect(codigo).toContain("cachedValterraFailedAt");
    expect(codigo).toContain("maybeSingle()");
    // Sigue devolviendo null en vez de lanzar.
    expect(codigo).toMatch(/catch[\s\S]{0,200}return null/);
  });

  test("no se introdujo ninguna migración de schema por este cambio", () => {
    // El hotfix es de una sola línea funcional: no toca la base.
    expect(codigo).not.toMatch(/alter table|create table|update\s+agencies/i);
  });
});
