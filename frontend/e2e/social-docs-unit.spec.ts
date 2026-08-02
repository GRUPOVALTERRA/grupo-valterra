import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * S16-SOCIAL-DOCS — guardas del kit operativo de redes (docs/social/).
 * La documentación NO puede divergir del código ni violar las políticas vigentes.
 */

const DOCS = join(__dirname, "../../docs/social");
const kitFiles = readdirSync(DOCS).filter((f) => f.endsWith(".md"));
const readDoc = (f: string) => readFileSync(join(DOCS, f), "utf8");
const allKit = () => kitFiles.map((f) => `### ${f}\n${readDoc(f)}`).join("\n");
const socialTs = () => readFileSync(join(__dirname, "../src/lib/social.ts"), "utf8");

test.describe("kit social documental", () => {
  test("el kit tiene los 5 documentos", () => {
    for (const f of [
      "SOCIAL_ACCOUNTS.md",
      "SOCIAL_PROFILE_COPY.md",
      "SOCIAL_PUBLISHING_CHECKLIST.md",
      "SOCIAL_ASSET_REQUIREMENTS.md",
      "SOCIAL_CHANGELOG.md",
    ]) {
      expect(kitFiles).toContain(f);
    }
  });

  test("URLs de SOCIAL_ACCOUNTS.md coinciden exactamente con lib/social.ts", () => {
    const codeUrls = [...socialTs().matchAll(/href: "([^"]+)"/g)].map((m) => m[1]).sort();
    const acc = readDoc("SOCIAL_ACCOUNTS.md");
    const docUrls = [...acc.matchAll(/https?:\/\/[^\s|)`",]+/g)]
      .map((m) => m[0])
      .filter((u) => /facebook\.com|instagram\.com|tiktok\.com|x\.com/.test(u))
      .sort();
    expect(docUrls).toEqual(codeUrls);
  });

  test("sin domicilio fisico en todo el kit", () => {
    const kit = allKit();
    expect(kit).not.toContain("Catamarca");
    expect(kit).not.toContain("Dpto. I");
    expect(kit).not.toContain("Piso 1");
  });

  test("sin emails prohibidos", () => {
    const kit = allKit();
    expect(kit).not.toContain("contacto@valterra.com.ar");
    expect(kit).not.toContain("acceso@grupovalterra.com.ar");
  });

  test("sin placeholders href='#'", () => {
    expect(allKit()).not.toContain('href="#"');
  });

  test("sin handles viejos/propuestos fuera de los reales", () => {
    const kit = allKit();
    expect(kit).not.toMatch(/instagram\.com\/grupovalterra(?!ar)/);
    expect(kit).not.toMatch(/tiktok\.com\/@grupovalterra(?!_ok)/);
    expect(kit).not.toMatch(/x\.com\/grupovalterra(?!ar)/);
    expect(kit).not.toMatch(/facebook\.com\/grupovalterra/);
  });

  test("sin material de acceso a cuentas", () => {
    expect(allKit()).not.toMatch(/contraseña|password|api[_ -]?key|código de recuperación|recovery code|cookie/i);
  });

  test("cambio de TikTok documentado como pendiente, no consumado", () => {
    const log = readDoc("SOCIAL_CHANGELOG.md");
    expect(log).toContain("@grupovalterra_ok");
    expect(log).toContain("01/09/2026");
    expect(readDoc("SOCIAL_ACCOUNTS.md")).toContain("ACCIÓN PENDIENTE");
  });
});
