import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Sprint 15-B — guardas del panel.
 *
 * Dos defectos que la prueba real destapó:
 *  1. `window.confirm` bloquea el hilo del renderer: la página deja de
 *     responder mientras el diálogo nativo está abierto.
 *  2. El formulario de edición enviaba `published`, pero desde la migración
 *     0009 esa columna es un espejo derivado de `status`: el trigger la
 *     recalcula y el valor enviado se descartaba en silencio.
 */

const SRC = join(__dirname, "../src");
const ADMIN = join(SRC, "app/admin");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(join(__dirname, ".."), p).split(sep).join("/");

const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

test.describe("S15-B — confirmaciones", () => {
  test("ningun componente del panel usa dialogos nativos bloqueantes", () => {
    const offenders = walk(ADMIN).filter((p) => {
      const c = codeOf(readFileSync(p, "utf8"));
      return /window\.(confirm|alert|prompt)\s*\(/.test(c);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  test("las acciones sensibles usan el modal de la aplicacion", () => {
    const controls = codeOf(
      readFileSync(join(ADMIN, "properties/PropertyStatusControls.tsx"), "utf8"),
    );
    expect(controls).toContain("ConfirmDialog");
    expect(existsSync(join(SRC, "components/admin/ConfirmDialog.tsx"))).toBe(true);
  });

  test("el modal es accesible y cancelable", () => {
    const dlg = readFileSync(join(SRC, "components/admin/ConfirmDialog.tsx"), "utf8");
    expect(dlg).toContain('role="dialog"');
    expect(dlg).toContain('aria-modal="true"');
    expect(dlg).toContain('"Escape"');
  });
});

test.describe("S15-B — un unico control de visibilidad", () => {
  const editForm = () =>
    codeOf(readFileSync(join(ADMIN, "properties/[slug]/edit/PropertyEditForm.tsx"), "utf8"));

  test("el formulario de edicion no envia published", () => {
    expect(editForm()).not.toContain('fd.set("published"');
    expect(editForm()).not.toContain("setPublished");
  });

  test("la edicion reutiliza los controles de ciclo de vida", () => {
    expect(editForm()).toContain("PropertyStatusControls");
  });

  test("la server action ignora published entrante", () => {
    const actions = codeOf(readFileSync(join(ADMIN, "properties/actions.ts"), "utf8"));
    expect(actions).not.toContain('formData.get("published")');
  });
});
