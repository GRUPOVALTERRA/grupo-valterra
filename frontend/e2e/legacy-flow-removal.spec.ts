import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Sprint 13 · C2D6 — guardas de RETIRADA DEL FLUJO LEGADO.
 *
 * Análisis estático del árbol productivo (src/): no requiere navegador, Auth,
 * Supabase ni red. Fijan el invariante de seguridad conseguido en C2:
 * `user_metadata` dejó de ser una fuente de autorización y /auth/callback ya no
 * puede crear memberships.
 */

const SRC = join(__dirname, "../src");
const CALLBACK = join(SRC, "app/auth/callback/route.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(join(__dirname, ".."), p).split(sep).join("/");

/** Líneas de código, sin comentarios de bloque ni de línea. */
function codeLines(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"));
}

test.describe("C2D6 — emisor legado eliminado", () => {
  test("el archivo del emisor legado ya no existe", () => {
    expect(existsSync(join(SRC, "services/agency-invites.ts"))).toBe(false);
  });

  test("ningún archivo productivo importa el emisor legado", () => {
    const offenders = walk(SRC).filter((p) => {
      const src = readFileSync(p, "utf8");
      return /from\s+["']@\/services\/agency-invites["']/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  test("addAgencyMembership (upsert que sobrescribía roles) ya no existe como código", () => {
    const offenders = walk(SRC).filter((p) =>
      codeLines(readFileSync(p, "utf8")).some((l) => l.includes("addAgencyMembership")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});

test.describe("C2D6 — /auth/callback sólo PKCE", () => {
  const source = () => readFileSync(CALLBACK, "utf8");

  test("conserva el intercambio PKCE y el saneamiento de next", () => {
    const code = codeLines(source()).join("\n");
    expect(code).toContain("exchangeCodeForSession");
    expect(code).toContain("sanitizeNext");
  });

  test("no lee pending_agency_id ni pending_role", () => {
    const code = codeLines(source()).join("\n");
    expect(code).not.toContain("pending_agency_id");
    expect(code).not.toContain("pending_role");
    expect(code).not.toContain("user_metadata");
  });

  test("no crea ni modifica memberships, ni usa SERVICE_ROLE", () => {
    const code = codeLines(source()).join("\n");
    expect(code).not.toContain("addAgencyMembership");
    expect(code).not.toContain("agency_members");
    expect(code).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(code).not.toContain("updateUserById");
  });

  test("un fallo de exchangeCode no concede acceso: redirige al login", () => {
    const code = codeLines(source()).join("\n");
    const idx = code.indexOf("if (error)");
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 260)).toContain("/admin/login?error=invalid-link");
  });
});

test.describe("C2D6 — user_metadata no autoriza en ningún punto productivo", () => {
  test("pending_* no aparece como código en src/ (sólo documentación)", () => {
    const offenders = walk(SRC).filter((p) =>
      codeLines(readFileSync(p, "utf8")).some(
        (l) => l.includes("pending_agency_id") || l.includes("pending_role"),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  test("la única vía de membership por invitación es la RPC accept_agency_invite", () => {
    // Invocación real de la RPC (no menciones en documentación).
    const callers = walk(SRC).filter((p) =>
      codeLines(readFileSync(p, "utf8")).some((l) =>
        l.includes('.rpc("accept_agency_invite"'),
      ),
    );
    // Sólo el POST de /auth/confirm la invoca.
    expect(callers.map(rel)).toEqual(["src/app/auth/confirm/actions.ts"]);
  });

  test("el issuer nuevo sigue siendo el único emisor con call site productivo", () => {
    const consumers = walk(SRC)
      .filter((p) => !p.includes("agency-invites-issuer"))
      .filter((p) => readFileSync(p, "utf8").includes("agency-invites-issuer"));
    expect(consumers.map(rel)).toEqual(["src/app/admin/agencies/actions.ts"]);
  });
});
