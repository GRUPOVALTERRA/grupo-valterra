import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Sprint 14-B — guardas del contenido público.
 *
 * Análisis estático de src/ (sin navegador, red ni Supabase). Impiden que
 * vuelvan a publicarse datos legales de relleno, métricas no acreditadas,
 * un email de contacto de otro dominio o enlaces principales rotos.
 */

const SRC = join(__dirname, "../src");
const PUBLIC_DIRS = [join(SRC, "components/home"), join(SRC, "components/layout")];
const HOME = join(SRC, "app/page.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(join(__dirname, ".."), p).split(sep).join("/");

/** Código sin comentarios: las menciones documentales no cuentan. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** Archivos que efectivamente se renderizan en la home. */
function renderedHomeFiles(): string[] {
  const home = codeOf(readFileSync(HOME, "utf8"));
  return walk(join(SRC, "components")).filter((p) => {
    const component = p.split(sep).pop()!.replace(/\.tsx?$/, "");
    return new RegExp(`<${component}[\\s/>]`).test(home);
  });
}

test.describe("S14-B — sin datos legales de relleno", () => {
  test("no aparece CUIT ni matrícula placeholder", () => {
    const offenders = PUBLIC_DIRS.flatMap((d) => walk(d)).filter((p) => {
      const code = codeOf(readFileSync(p, "utf8"));
      return /30-00000000-0/.test(code) || /CCIPER/.test(code);
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});

test.describe("S14-B — sin métricas no acreditadas", () => {
  const CLAIMS = [/1\.200/, /8\.500/, /98\s*%/, /50\.000/, /\+450/, /\+320/];

  test("las secciones renderizadas no publican cifras inventadas", () => {
    const offenders = renderedHomeFiles().filter((p) => {
      const code = codeOf(readFileSync(p, "utf8"));
      return CLAIMS.some((re) => re.test(code));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  test("StatsSection y PlansSection siguen fuera del render de la home", () => {
    const home = codeOf(readFileSync(HOME, "utf8"));
    expect(home).not.toContain("<StatsSection");
    expect(home).not.toContain("<PlansSection");
  });
});

test.describe("S14-B — contacto", () => {
  test("no se publica un email de otro dominio", () => {
    const offenders = PUBLIC_DIRS.flatMap((d) => walk(d)).filter((p) =>
      codeOf(readFileSync(p, "utf8")).includes("contacto@valterra.com.ar"),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  test("se conservan canales verificables (teléfono y WhatsApp)", () => {
    const footer = readFileSync(join(SRC, "components/layout/Footer.tsx"), "utf8");
    expect(footer).toContain("tel:+5493795159096");
    expect(footer).toContain("wa.me/5493795159096");
  });
});

test.describe("S14-B — navegación pública", () => {
  /** Ids reales disponibles para anclas. */
  const REAL_IDS = ["contacto"];

  test("ningún enlace del header o del footer apunta a un ancla inexistente", () => {
    const files = [
      join(SRC, "components/layout/Navbar.tsx"),
      join(SRC, "components/layout/Footer.tsx"),
    ];
    const bad: string[] = [];
    for (const f of files) {
      const code = codeOf(readFileSync(f, "utf8"));
      for (const m of code.matchAll(/href="([^"]*#[^"]*)"/g)) {
        const anchor = m[1].split("#")[1] ?? "";
        if (!REAL_IDS.includes(anchor)) bad.push(`${rel(f)} → ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("no quedan enlaces vacíos href=\"#\"", () => {
    const offenders = PUBLIC_DIRS.flatMap((d) => walk(d)).filter((p) =>
      /href="#"/.test(codeOf(readFileSync(p, "utf8"))),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  test("el buscador del hero navega al listado en vez de ser decorativo", () => {
    const code = codeOf(readFileSync(join(SRC, "components/home/SearchBar.tsx"), "utf8"));
    expect(code).toContain("router.push");
    expect(code).toContain("/propiedades?");
  });

  test("las categorías enlazan al listado filtrado, no a anclas", () => {
    const code = codeOf(
      readFileSync(join(SRC, "components/home/CategoriesSection.tsx"), "utf8"),
    );
    expect(code).toContain("/propiedades?propertyType=");
    expect(code).not.toContain("#cat-");
  });
});
