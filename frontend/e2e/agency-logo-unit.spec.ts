import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LOGO_MAX_BYTES,
  LOGO_MAX_SIDE_PX,
  LOGO_MIN_SIDE_PX,
  LOGO_TARGET_SIDE_PX,
  agencyLogoStoragePath,
  canManageAgencyLogo,
  checkLogoBytes,
  checkLogoDimensions,
  isAgencyLogoPath,
} from "../src/lib/agency-logo";
import { MIN_IMAGE_DIMENSION } from "../src/lib/image-type";

/**
 * S26-MAP-02 — logo miniatura de agencia.
 * Reglas puras + guardas estaticas de la action, el servicio y el uploader.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

const ACTION = read("src/app/admin/agencia/actions.ts");
const SERVICE = read("src/services/agency-logo.ts");
const BADGES = read("src/services/agency-badges.ts");
const PAGE = read("src/app/admin/agencia/page.tsx");
const UPLOADER = read("src/components/admin/agencies/AgencyLogoUploader.tsx");
const RULES = read("src/lib/agency-logo.ts");

const AG = "f8418ade-1ced-4996-93e4-ccfb687d9785";
const RND = "0b6f2c3e-9a1d-4f5b-8c7e-123456789abc";

test.describe("reglas del logo", () => {
  test("los limites son coherentes con el validador de imagenes", () => {
    expect(LOGO_MIN_SIDE_PX).toBe(MIN_IMAGE_DIMENSION);
    expect(LOGO_TARGET_SIDE_PX).toBeGreaterThanOrEqual(LOGO_MIN_SIDE_PX);
    expect(LOGO_TARGET_SIDE_PX).toBeLessThanOrEqual(LOGO_MAX_SIDE_PX);
    expect(LOGO_MAX_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  test("peso: 200 KB es el techo", () => {
    expect(checkLogoBytes(LOGO_MAX_BYTES)).toBeNull();
    expect(checkLogoBytes(LOGO_MAX_BYTES + 1)).toBe("too-heavy");
  });

  test("dimensiones: cuadrado dentro del rango pasa; lo demas se rechaza con motivo", () => {
    expect(checkLogoDimensions({ width: 256, height: 256 })).toBeNull();
    expect(checkLogoDimensions({ width: 200, height: 250 })).toBeNull();
    expect(checkLogoDimensions({ width: 199, height: 256 })).toBe("too-small");
    expect(checkLogoDimensions({ width: 513, height: 256 })).toBe("too-big");
    expect(checkLogoDimensions({ width: 512, height: 200 })).toBe("not-square");
  });

  test("solo owner y admin cambian el logo", () => {
    expect(canManageAgencyLogo("owner")).toBe(true);
    expect(canManageAgencyLogo("admin")).toBe(true);
    expect(canManageAgencyLogo("agent")).toBe(false);
    expect(canManageAgencyLogo("viewer")).toBe(false);
    expect(canManageAgencyLogo(null)).toBe(false);
  });

  test("el path vive bajo el prefijo de la agencia y con nombre aleatorio", () => {
    const path = agencyLogoStoragePath(AG, RND, "png");
    expect(path).toBe(`agency/${AG}/logo/${RND}.png`);
    expect(isAgencyLogoPath(path)).toBe(true);
  });

  test("identificadores sin forma de uuid o extension rara no producen path", () => {
    // Control cruzado B8: un path que la lectura no reconoceria seria una
    // subida "exitosa" invisible.
    expect(agencyLogoStoragePath("valterra", RND, "png")).toBeNull();
    expect(agencyLogoStoragePath(AG, "logo", "png")).toBeNull();
    expect(agencyLogoStoragePath(AG, RND, "svg")).toBeNull();
    expect(agencyLogoStoragePath(`${AG}/../x`, RND, "png")).toBeNull();
  });

  test("cualquier otro valor en logo_url NO se resuelve a imagen", () => {
    expect(isAgencyLogoPath("https://evil.example/logo.png")).toBe(false);
    expect(isAgencyLogoPath(`agency/${AG}/logo/../../secreto.png`)).toBe(false);
    expect(isAgencyLogoPath(`agency/${AG}/property/x/${RND}.png`)).toBe(false);
    expect(isAgencyLogoPath(`agency/${AG}/logo/${RND}.svg`)).toBe(false);
    expect(isAgencyLogoPath(`agency/${AG}/logo/logo.png`)).toBe(false);
    expect(isAgencyLogoPath(null)).toBe(false);
  });
});

test.describe("server action", () => {
  const code = codigo(ACTION);

  test("el navegador manda slug y archivo; la agencia y el rol salen de la sesion", () => {
    expect(ACTION).toContain('"use server"');
    expect(ACTION).toContain("getAdminContext()");
    expect(ACTION).toContain("getAgencyBySlug(");
    expect(code).not.toMatch(/formData\.get\("agency_?[iI]d"\)/);
    expect(code).not.toMatch(/formData\.get\("path"\)/);
  });

  test("permiso: super-admin o owner/admin de ESA agencia", () => {
    expect(ACTION).toContain("ctx.isSuperAdmin ||");
    expect(ACTION).toContain("m.agencyId === agency.id && canManageAgencyLogo(m.role)");
  });

  test("rate limit y codigos cerrados, sin filtrar errores internos", () => {
    expect(ACTION).toContain("rateLimit(");
    expect(code).not.toMatch(/error\.message/);
    expect(code).not.toMatch(/res\.path/);
  });

  test("revalida las superficies donde se ve el logo", () => {
    for (const ruta of ['"/mapa"', '"/propiedades"', '"/admin/agencia"']) {
      expect(ACTION).toContain(`revalidatePath(${ruta})`);
    }
  });
});

test.describe("servicio de escritura", () => {
  test("valida con el UNICO punto de entrada y despues endurece", () => {
    expect(SERVICE).toContain("inspectImageBytes(");
    expect(SERVICE).toContain("checkLogoBytes(");
    expect(SERVICE).toContain("checkLogoDimensions(");
    expect(codigo(SERVICE)).not.toMatch(/sniffImageType|verifyImageStructure/);
  });

  test("orden seguro: subir nuevo → apuntar fila → borrar viejo", () => {
    const subir = SERVICE.indexOf("uploadObject(");
    const escribir = SERVICE.indexOf("writeLogoPath(args.agencyId, path)");
    const borrar = SERVICE.indexOf("deleteOldLogo(oldPath)");
    expect(subir).toBeGreaterThan(0);
    expect(escribir).toBeGreaterThan(subir);
    expect(borrar).toBeGreaterThan(escribir);
  });

  test("nombre aleatorio, sin upsert, nunca el nombre original", () => {
    expect(SERVICE).toContain("randomUUID()");
    expect(SERVICE).toContain("upsert: false");
    expect(codigo(SERVICE)).not.toMatch(/file\.name/);
  });

  test("solo borra objetos con forma de logo propio", () => {
    expect(SERVICE).toContain("if (!isAgencyLogoPath(oldPath)) return;");
  });
});

test.describe("lectura publica de insignias", () => {
  test("selecciona solo id, slug, name y logo_url (nada sensible)", () => {
    // S26-MAP-04: slug entra para decidir el isotipo por defecto de la agencia canonica.
    expect(BADGES).toContain('select("id, slug, name, logo_url")');
    expect(codigo(BADGES)).not.toMatch(/cuit|contact_email|contact_phone|whatsapp|address/);
  });

  test("resuelve a URL unicamente paths con forma de logo", () => {
    expect(BADGES).toContain("if (!isAgencyLogoPath(value)) return null;");
    expect(BADGES).toContain("resolvePublicUrl(BUCKET, value)");
  });
});

test.describe("pantalla Mi agencia y uploader", () => {
  test("la agencia sale de scopedAgencyId, nunca de la URL", () => {
    expect(PAGE).toContain("ctx.scopedAgencyId");
    expect(codigo(PAGE)).not.toMatch(/params|searchParams/);
    expect(PAGE).toContain("robots: { index: false, follow: false }");
  });

  test("los owners editan con el MISMO formulario y la MISMA action del super-admin", () => {
    // Decision del titular 13/09: sin logica de permisos nueva, se reusa lo existente.
    expect(PAGE).toContain("AgencySettingsForm");
    expect(codigo(PAGE)).not.toMatch(/updateAgency\(|from\("agencies"\)\.update/);
    // Sin permiso de edicion se muestra solo lectura, nunca el formulario.
    expect(PAGE).toContain("{canEdit ? (");
  });

  test("el navegador fabrica la miniatura al lado objetivo y sube PNG", () => {
    expect(UPLOADER).toContain("LOGO_TARGET_SIDE_PX");
    expect(UPLOADER).toContain('canvas.toBlob(resolve, "image/png")');
    expect(UPLOADER).toContain('fd.set("file", blob, "logo.png")');
    // "contain": nunca recorta el logo.
    expect(UPLOADER).toContain("Math.min(side / w, side / h)");
  });

  test("la documentacion del modulo de reglas deja explicito que SVG queda afuera", () => {
    expect(RULES).toMatch(/SVG/);
  });
});
