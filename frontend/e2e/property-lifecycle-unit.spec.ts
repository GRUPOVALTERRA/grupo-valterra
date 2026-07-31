import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import Module from "node:module";

/**
 * Sprint 15-A — ciclo de vida de propiedades.
 *
 * Unitarios puros (slug + máquina de estados) más guardas de análisis estático
 * sobre las server actions y el sitio público. Sin navegador, sin red, sin
 * Supabase, Storage ni Resend.
 */

const SRC = join(__dirname, "../src");
const require_ = Module.createRequire(__filename);
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Código sin comentarios: las menciones documentales no cuentan. */
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/* ---------- slug ---------- */

test.describe("slug", () => {
  const { slugify, resolveSlug } = require_("../src/lib/property-slug.ts");

  test("normaliza acentos, mayusculas y simbolos", () => {
    expect(slugify("Casa Premium frente al río Paraná")).toBe("casa-premium-frente-al-rio-parana");
    expect(slugify("  Depto  ¡nuevo!  ")).toBe("depto-nuevo");
    expect(slugify("Ñandú & Cía")).toBe("nandu-cia");
  });

  test("resuelve colisiones de forma determinística", () => {
    expect(resolveSlug("Casa en Parana", [])).toBe("casa-en-parana");
    expect(resolveSlug("Casa en Parana", ["casa-en-parana"])).toBe("casa-en-parana-2");
    expect(resolveSlug("Casa en Parana", ["casa-en-parana", "casa-en-parana-2"])).toBe(
      "casa-en-parana-3",
    );
    // mismo input, mismo resultado
    expect(resolveSlug("Casa en Parana", ["casa-en-parana"])).toBe(
      resolveSlug("Casa en Parana", ["casa-en-parana"]),
    );
  });

  test("un titulo sin caracteres utiles no genera slug vacio", () => {
    expect(slugify("###")).toBe("");
    expect(resolveSlug("###", [])).toBe("propiedad");
  });
});

/* ---------- máquina de estados ---------- */

test.describe("estados", () => {
  const { canTransition, isPubliclyVisible, isPropertyStatus } =
    require_("../src/lib/property-status.ts");

  test("solo published es visible publicamente", () => {
    expect(isPubliclyVisible("published")).toBe(true);
    for (const s of ["draft", "unpublished", "archived"]) {
      expect(isPubliclyVisible(s)).toBe(false);
    }
  });

  test("restaurar no publica automaticamente", () => {
    expect(canTransition("archived", "published")).toBe(false);
    expect(canTransition("archived", "unpublished")).toBe(true);
    expect(canTransition("archived", "draft")).toBe(true);
  });

  test("transiciones validas del ciclo", () => {
    expect(canTransition("draft", "published")).toBe(true);
    expect(canTransition("published", "unpublished")).toBe(true);
    expect(canTransition("unpublished", "published")).toBe(true);
    expect(canTransition("published", "archived")).toBe(true);
  });

  test("estado desconocido rechazado", () => {
    expect(isPropertyStatus("zombie")).toBe(false);
    expect(isPropertyStatus("published")).toBe(true);
  });
});

/* ---------- server actions ---------- */

test.describe("altas y permisos", () => {
  const actions = () => codeOf(read("app/admin/properties/actions.ts"));

  test("el alta nace draft y no acepta status del cliente", () => {
    const svc = codeOf(read("services/properties.ts"));
    expect(svc).toContain('status: "draft"');
    // createProperty no lee un status entrante
    const create = svc.slice(svc.indexOf("export async function createProperty"));
    expect(create.slice(0, create.indexOf("export async function setPropertyStatus"))).not.toContain(
      "data.status",
    );
  });

  test("agency_id se resuelve server-side, nunca del formulario", () => {
    const code = actions();
    expect(code).toContain("requireAgencyPermission");
    expect(code).not.toContain('formData.get("agencyId")');
    expect(code).not.toContain('formData.get("agency_id")');
  });

  test("viewer no entra en los roles habilitados", () => {
    const code = actions();
    const editors = code.slice(code.indexOf("const EDITOR_ROLES"), code.indexOf("type AllowedRole"));
    expect(editors).not.toContain("viewer");
  });

  test("publicar exige ficha valida", () => {
    const code = actions();
    const idx = code.indexOf('if (next === "published")');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 700)).toContain("validateProperty");
  });

  test("las escrituras acotan por agencia ademas del chequeo de permisos", () => {
    const svc = codeOf(read("services/properties.ts"));
    const setStatus = svc.slice(svc.indexOf("export async function setPropertyStatus"));
    expect(setStatus).toContain('.eq("agency_id", args.agencyId)');
  });

  test("no existe borrado fisico de propiedades", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(p)) out.push(p);
      }
      return out;
    };
    const offenders = walk(SRC).filter((p) =>
      /from\("properties"\)\s*\n?\s*\.delete\(/.test(codeOf(readFileSync(p, "utf8"))),
    );
    expect(offenders.map((p) => p.split(sep).slice(-2).join("/"))).toEqual([]);
  });
});

/* ---------- sitio público ---------- */

test.describe("sitio publico", () => {
  test("listado y detalle publicos siguen filtrando por published", () => {
    const svc = codeOf(read("services/properties.ts"));
    expect(svc).toContain('if (!filters.includeDraft) query = query.eq("published", true)');
    expect(svc).toContain('if (!options.includeDraft) q = q.eq("published", true)');
  });

  test("el sitemap no pide borradores", () => {
    const sitemap = codeOf(read("app/sitemap.ts"));
    expect(sitemap).toContain("getAllProperties()");
    expect(sitemap).not.toContain("includeDraft");
  });
});

/* ---------- newsletter ---------- */

test.describe("newsletter", () => {
  test("no queda un formulario inerte en el pie", () => {
    const footer = codeOf(read("components/layout/Footer.tsx"));
    expect(footer).not.toContain("NewsletterForm");
    expect(footer).not.toContain("Newsletter");
  });
});

/* ---------- compatibilidad de despliegue ---------- */

test.describe("orden deploy/migracion", () => {
  test("el servicio tolera que la migracion 0009 aun no este aplicada", () => {
    const svc = codeOf(read("services/properties.ts"));
    // detecta columna inexistente (42703) y reintenta con el esquema previo
    expect(svc).toContain("isMissingColumn");
    expect(svc).toContain('"42703"');
    expect(svc).toContain("COLUMNS_BASE");
    expect(svc).toContain("properties.select.legacy");
    expect(svc).toContain("properties.bySlug.legacy");
  });
});
