import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * SPEC-S23 — guardas de RETIRO DEL PATH LEGACY `ADMIN_TOKEN`.
 *
 * Análisis estático del árbol productivo (src/): no requiere navegador, Auth,
 * Supabase ni red. Fija el invariante de seguridad de S23:
 *
 *   ninguna cookie propia autoriza /admin/*, y ninguna identidad de super-admin
 *   se construye sin un user de Supabase Auth.
 *
 * Los comentarios se descartan antes de evaluar: las menciones históricas a
 * ADMIN_TOKEN en la documentación del código son legítimas, el código no.
 */

const SRC = join(__dirname, "../src");
const MIDDLEWARE = join(SRC, "middleware.ts");
const ADMIN_CONTEXT = join(SRC, "lib/admin-context.ts");
const LOGIN_DIR = join(SRC, "app/admin/login");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(join(__dirname, ".."), p).split(sep).join("/");

/** Código sin comentarios de bloque ni de línea. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const codeOf = (p: string) => code(readFileSync(p, "utf8"));

/**
 * Rango [inicio, fin) del bloque `{ ... }` que abre `marker`, balanceando llaves.
 * Permite exigir que algo esté DENTRO de un bloque y no sólo más abajo en el archivo.
 */
function blockRange(source: string, marker: string): [number, number] {
  const start = source.indexOf(marker);
  expect(start, `se esperaba encontrar \`${marker}\` en el archivo`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return [start, i + 1];
    }
  }
  throw new Error(`bloque sin cerrar para ${marker}`);
}

const blockOf = (source: string, marker: string) => {
  const [a, b] = blockRange(source, marker);
  return source.slice(a, b);
};

test.describe("S23 — el secreto compartido ya no existe en el código", () => {
  test("ningún archivo productivo lee process.env.ADMIN_TOKEN", () => {
    const offenders = walk(SRC).filter((p) => /process\.env\.ADMIN_TOKEN/.test(codeOf(p)));
    expect(offenders.map(rel)).toEqual([]);
  });

  test("ningún archivo productivo lee process.env.ADMIN_PASSWORD", () => {
    const offenders = walk(SRC).filter((p) => /process\.env\.ADMIN_PASSWORD/.test(codeOf(p)));
    expect(offenders.map(rel)).toEqual([]);
  });

  test("el nombre de la cookie legacy no aparece en código productivo", () => {
    const offenders = walk(SRC).filter((p) => codeOf(p).includes("valterra-admin-session"));
    expect(offenders.map(rel)).toEqual([]);
  });
});

test.describe("S23 — el middleware no acepta cookies como autorización", () => {
  test("no lee cookies individuales del request (getAll() del refresh de Supabase sigue permitido)", () => {
    expect(codeOf(MIDDLEWARE)).not.toMatch(/request\.cookies\.get\s*\(/);
  });

  test("el guard de /admin/* no toca cookies: sólo la sesión validada por Supabase", () => {
    const guard = blockOf(codeOf(MIDDLEWARE), "if (isAdminPath)");
    expect(guard).not.toMatch(/cookie/i);
    expect(guard).toContain("supabaseUserId");
  });

  test("la sesión se valida contra Supabase Auth, no se cree por su mero valor", () => {
    expect(codeOf(MIDDLEWARE)).toMatch(/supabase\.auth\.getUser\(\)/);
  });

  test("/admin/login sigue excluido del guard (única puerta de entrada)", () => {
    expect(codeOf(MIDDLEWARE)).toContain('!pathname.startsWith("/admin/login")');
  });
});

test.describe("S23 — admin-context sólo emite identidad con user de Supabase", () => {
  test("no importa cookies de next/headers", () => {
    expect(codeOf(ADMIN_CONTEXT)).not.toMatch(/from\s+["']next\/headers["']/);
  });

  test("todo isSuperAdmin: true vive DENTRO del bloque `if (user)`", () => {
    const src = codeOf(ADMIN_CONTEXT);
    expect(src, "admin-context debe resolver el user de Supabase").toContain(
      "const user = await getCurrentUser();",
    );
    const [gateStart, gateEnd] = blockRange(src, "if (user)");
    const grants = [...src.matchAll(/isSuperAdmin:\s*true/g)].map((m) => m.index ?? -1);
    expect(grants.length, "debe seguir existiendo el path de super-admin").toBeGreaterThan(0);
    const outside = grants.filter((at) => at < gateStart || at > gateEnd);
    expect(
      outside,
      "hay un isSuperAdmin: true fuera del gate de user — identidad sin usuario",
    ).toEqual([]);
  });

  test("SUPER_ADMIN_EMAILS sigue siendo el criterio de super-admin (no se tocó en S23)", () => {
    expect(codeOf(ADMIN_CONTEXT)).toContain("SUPER_ADMIN_EMAILS");
  });
});

test.describe("S23 — /admin/login expone un solo método", () => {
  test("no queda una server action de login por password", () => {
    const src = codeOf(join(LOGIN_DIR, "actions.ts"));
    expect(src).not.toMatch(/export\s+async\s+function\s+loginAction/);
    expect(src).toMatch(/export\s+async\s+function\s+requestMagicLink/);
  });

  test("el formulario no ofrece la pestaña Emergencia", () => {
    const src = codeOf(join(LOGIN_DIR, "LoginForm.tsx"));
    expect(src).not.toContain("Emergencia");
    expect(src).not.toMatch(/legacyAction/);
  });

  test("la página de login no cablea ninguna acción legacy", () => {
    expect(codeOf(join(LOGIN_DIR, "page.tsx"))).not.toMatch(/loginAction|legacyAction/);
  });
});
