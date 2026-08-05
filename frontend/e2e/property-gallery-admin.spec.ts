import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectImageBytes } from "../src/lib/image-type";
import { verifyImageStructure } from "../src/lib/image-decode";
import { canManageGallery } from "../src/lib/property-gallery";
import {
  htmlBytes,
  pdfBytes,
  pngHeaderOnly,
  pngWithBadCrc,
  pngWithTrailingGarbage,
  svgBytes,
  truncatedJpeg,
  truncatedPng,
  validJpeg,
  validPng,
  validWebp,
  webpWithBadRiffSize,
} from "./fixtures/image-bytes";

/**
 * S17 PR2 — galería administrativa.
 *
 * Validación de archivos sobre fixtures de bytes locales + análisis estático
 * de las server actions y la UI. Sin Supabase, sin Storage, sin red, sin
 * archivos reales: ninguna interacción con Production.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const ACTIONS = () => read("src/app/admin/properties/gallery-actions.ts");
const UI = () => read("src/components/admin/properties/PropertyGallerySection.tsx");
const PAGE = () => read("src/app/admin/properties/[slug]/edit/page.tsx");
const SERVICE = () => read("src/services/property-images.ts");

/* ============================================================
 * Validación de archivo real
 * ============================================================ */
test.describe("validación de imagen", () => {
  test("los tres formatos válidos e íntegros se aceptan", () => {
    for (const bytes of [validPng(800, 600), validJpeg(800, 600), validWebp(800, 600)]) {
      const r = inspectImageBytes(bytes, undefined);
      expect(r.ok).toBe(true);
      expect(r.dimensions).toEqual({ width: 800, height: 600 });
    }
  });

  test("SVG se rechaza (vector de XSS almacenado), aunque se declare imagen", () => {
    expect(inspectImageBytes(svgBytes, "image/png").ok).toBe(false);
    expect(inspectImageBytes(svgBytes, "image/svg+xml").reason).toBe("unrecognized-content");
  });

  test("HTML y PDF disfrazados se rechazan", () => {
    expect(inspectImageBytes(htmlBytes, "image/jpeg").reason).toBe("unrecognized-content");
    expect(inspectImageBytes(pdfBytes, "image/png").reason).toBe("unrecognized-content");
  });

  test("DECODIFICACIÓN: un PNG truncado no pasa, aunque su cabecera sea válida", () => {
    expect(inspectImageBytes(truncatedPng(), undefined).reason).toBe("not-decodable");
  });

  test("DECODIFICACIÓN: un JPEG sin EOI (cortado) no pasa", () => {
    expect(inspectImageBytes(truncatedJpeg(), undefined).reason).toBe("not-decodable");
  });

  test("DECODIFICACIÓN: polyglot — basura pegada después del fin de la imagen", () => {
    expect(inspectImageBytes(pngWithTrailingGarbage(), undefined).reason).toBe("not-decodable");
  });

  test("DECODIFICACIÓN: CRC del header alterado se detecta", () => {
    expect(verifyImageStructure(pngWithBadCrc(), "image/png").reason).toBe("checksum-mismatch");
    expect(inspectImageBytes(pngWithBadCrc(), undefined).ok).toBe(false);
  });

  test("DECODIFICACIÓN: cabecera válida + payload arbitrario no pasa", () => {
    expect(inspectImageBytes(pngHeaderOnly(), undefined).ok).toBe(false);
  });

  test("DECODIFICACIÓN: WebP con tamaño RIFF incoherente no pasa", () => {
    expect(inspectImageBytes(webpWithBadRiffSize(), undefined).reason).toBe("not-decodable");
  });

  test("tipo declarado distinto del contenido real se rechaza", () => {
    expect(inspectImageBytes(validPng(800, 600), "image/jpeg").reason).toBe("type-mismatch");
  });

  test("tamaño y dimensiones fuera de rango se rechazan", () => {
    expect(inspectImageBytes(new Uint8Array(0), undefined).reason).toBe("empty");
    expect(inspectImageBytes(validPng(100, 100), undefined).reason).toBe("dimensions-out-of-range");
    expect(inspectImageBytes(validPng(9000, 600), undefined).reason).toBe("dimensions-out-of-range");
    expect(inspectImageBytes(validPng(200, 200), undefined).ok).toBe(true);
  });

  test("no existe una vía de validación más débil: un único punto de entrada", () => {
    const svc = codeOf(SERVICE());
    expect(svc).toContain("inspectImageBytes(input.bytes, input.declaredType)");
    // El servicio no llama al sniff crudo ni parsea dimensiones por su cuenta.
    expect(svc).not.toContain("sniffImageType(");
    expect(svc).not.toContain("parseImageDimensions(");
    const lib = codeOf(read("src/lib/image-type.ts"));
    expect(lib).toContain("verifyImageStructure(bytes, sniffed)");
  });
});

/* ============================================================
 * Permisos y aislamiento
 * ============================================================ */
test.describe("permisos y aislamiento", () => {
  test("viewer denegado; owner/admin/agent habilitados", () => {
    expect(canManageGallery("viewer")).toBe(false);
    expect(canManageGallery("")).toBe(false);
    for (const r of ["owner", "admin", "agent"]) expect(canManageGallery(r)).toBe(true);
  });

  test("TODA acción resuelve scope server-side antes de operar", () => {
    const a = codeOf(ACTIONS());
    const exported = a.match(/export async function (\w+)/g) ?? [];
    expect(exported.length).toBe(5); // upload, setCover, move, updateAlt, delete
    // Cada una empieza resolviendo el scope.
    const calls = a.match(/await resolveScope\(/g) ?? [];
    expect(calls.length).toBe(5);
    expect(a).toContain("getAdminContext()");
    expect(a).toContain("getPropertyBySlug(slug, { includeDraft: true })");
    expect(a).toContain("canManageGallery(m.role)");
    expect(a).toContain("m.agencyId === agencyId");
  });

  test("sesión ausente o de otra agencia => forbidden, sin tocar nada", () => {
    const a = codeOf(ACTIONS());
    const scope = a.slice(a.indexOf("async function resolveScope"), a.indexOf("function refresh"));
    expect(scope).toContain('if (!ctx.isSuperAdmin && !ctx.userId) return { ok: false, code: "forbidden" }');
    expect(scope).toContain('return { ok: false, code: "forbidden" }');
    // El fallo de permisos ocurre ANTES de cualquier llamada al servicio.
    expect(scope).not.toContain("addPropertyImage");
    expect(scope).not.toContain("removePropertyImage");
  });

  test("el cliente NO puede enviar agencia, path ni posiciones", () => {
    const a = codeOf(ACTIONS());
    for (const banned of ['formData.get("agency', "storagePath", "storage_path", "position:"]) {
      expect(a).not.toContain(banned);
    }
    // La agencia SIEMPRE sale de la propiedad resuelta server-side.
    expect(a).toContain("const agencyId = property.agencyId");
    expect(a).toContain("agencyId: resolved.scope.agencyId");
    // Del formulario sólo se leen slug y archivos.
    const reads = a.match(/formData\.get\w*\("(\w+)"\)/g) ?? [];
    expect(new Set(reads)).toEqual(new Set(['formData.get("slug")', 'formData.getAll("files")']));
  });

  test("el borrado nunca acepta un path del cliente: va por imageId + scope", () => {
    const a = codeOf(ACTIONS());
    const del = a.slice(a.indexOf("export async function deletePropertyImageAction"));
    expect(del).toContain("removePropertyImage(imageId, resolved.scope.propertyId, resolved.scope.agencyId)");
    expect(del).not.toContain("path");
  });
});

/* ============================================================
 * Consistencia
 * ============================================================ */
test.describe("consistencia", () => {
  test("upload: validar → subir → insertar → compensar si falla el INSERT", () => {
    const svc = codeOf(SERVICE());
    const add = svc.slice(svc.indexOf("export async function addPropertyImage"), svc.indexOf("export async function setCoverImage"));
    expect(add.indexOf("inspectImageBytes")).toBeLessThan(add.indexOf("uploadObject"));
    expect(add.indexOf("uploadObject")).toBeLessThan(add.indexOf(".insert("));
    expect(add).toContain("deleteObject({ bucket: GALLERY_BUCKET, path })"); // compensación
  });

  test("portada única + sincronización de cover_image", () => {
    const svc = codeOf(SERVICE());
    const set = svc.slice(svc.indexOf("export async function setCoverImage"), svc.indexOf("export async function reorderPropertyImages"));
    expect(set.indexOf("is_cover: false")).toBeLessThan(set.indexOf("is_cover: true"));
    expect(set.indexOf("syncCoverCache")).toBeGreaterThan(set.indexOf("is_cover: true"));
    // Un fallo de sincronización se registra saneado, no rompe la operación.
    const sync = svc.slice(svc.indexOf("async function syncCoverCache"), svc.indexOf("export async function listPropertyImages"));
    expect(sync).toContain("log.error");
    expect(sync).not.toContain("throw");
  });

  test("eliminar la portada promueve la siguiente o deja cover_image null", () => {
    const svc = codeOf(SERVICE());
    const del = svc.slice(svc.indexOf("export async function removePropertyImage"));
    expect(del).toContain("if (row.is_cover)");
    expect(del).toContain("setCoverImage(next.id, propertyId, agencyId)");
    expect(del).toContain("syncCoverCache(propertyId, agencyId, null)");
  });

  test("reordenar: el intercambio se calcula server-side y respeta los extremos", () => {
    const a = codeOf(ACTIONS());
    const move = a.slice(a.indexOf("export async function movePropertyImageAction"), a.indexOf("export async function updatePropertyImageAltAction"));
    expect(move).toContain('direction === "up" ? index - 1 : index + 1');
    expect(move).toContain("if (target < 0 || target >= ids.length) return { ok: true }");
    expect(move).toContain("reorderPropertyImages(");
    // El cliente sólo manda la dirección.
    expect(move).toContain('direction !== "up" && direction !== "down"');
  });

  test("alt text se sanea en el servicio, no en el cliente", () => {
    const svc = codeOf(SERVICE());
    expect(svc).toContain("alt_text: sanitizeAltText(altText)");
  });

  test("no se crean migraciones, buckets ni policies en este PR", () => {
    const a = ACTIONS();
    const ui = UI();
    for (const src of [a, ui]) {
      expect(src).not.toContain("createBucket");
      expect(src.toLowerCase()).not.toContain("create policy");
      expect(src).not.toContain("storage.objects");
    }
  });
});

/* ============================================================
 * UI
 * ============================================================ */
test.describe("UI de la galería", () => {
  test("controles exigidos presentes", () => {
    const ui = UI();
    expect(ui).toContain("multiple"); // selector múltiple
    expect(ui).toContain("Agregar fotos");
    expect(ui).toContain("Subiendo y validando las imágenes…"); // progreso
    expect(ui).toContain("Portada"); // badge
    expect(ui).toContain("Usar como portada");
    expect(ui).toContain('aria-label="Mover antes"');
    expect(ui).toContain('aria-label="Mover después"');
    expect(ui).toContain("Descripción (alt)");
    expect(ui).toContain("Eliminar");
    expect(ui).toContain("Todavía no hay fotos"); // estado vacío
  });

  test("diálogo React controlado; sin diálogos nativos", () => {
    const ui = codeOf(UI());
    expect(ui).toContain('role="dialog"');
    expect(ui).toContain('aria-modal="true"');
    expect(ui).not.toContain("window.confirm");
    expect(ui).not.toContain("alert(");
    expect(ui).not.toContain("prompt(");
  });

  test("desktop y móvil: la grilla es responsiva y los controles se envuelven", () => {
    const ui = UI();
    expect(ui).toContain("sm:grid-cols-2");
    expect(ui).toContain("lg:grid-cols-3");
    expect(ui).toContain("flex-wrap");
  });

  test("no se exponen paths, ids internos ni errores crudos", () => {
    const ui = UI();
    // La vista recortada que llega al cliente no tiene storage_path.
    const iface = ui.slice(ui.indexOf("export interface GalleryImageView"), ui.indexOf("interface Props"));
    expect(iface).not.toContain("storagePath");
    expect(iface).not.toContain("agency");
    // Los errores se muestran por código traducido.
    expect(ui).toContain("GALLERY_ERROR_MESSAGES[res.code]");
    expect(ui).not.toContain("res.error");
    // El id se usa como `key` y como argumento de las acciones, pero NUNCA
    // se renderiza como contenido visible (posición de texto en JSX).
    expect(ui).not.toContain(">{img.id}");
    expect(ui).not.toContain("{img.id}<");
    expect(ui).not.toContain("{img.storagePath");
  });

  test("la página pasa una vista recortada y resuelve permisos server-side", () => {
    const page = codeOf(PAGE());
    expect(page).toContain("canManageGallery(m.role)");
    expect(page).toContain("ctx.isSuperAdmin ||");
    expect(page).toContain("listPropertyImages(property.id, property.agencyId)");
    const map = page.slice(page.indexOf("galleryImages = res.value.map"), page.indexOf("return ("));
    expect(map).toContain("id: i.id");
    expect(map).toContain("url: i.url");
    expect(map).toContain("isCover: i.isCover");
    expect(map).not.toContain("storagePath");
  });

  test("los controles no se renderizan sin permiso (defensa en profundidad)", () => {
    const ui = codeOf(UI());
    expect(ui).toContain("if (!canManage) return null");
  });

  test("anti doble-submit durante una operación en curso", () => {
    const ui = codeOf(UI());
    expect(ui).toContain("if (pending) return");
    expect(ui).toContain("useTransition");
    expect((ui.match(/disabled=\{pending/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

/* ============================================================
 * Superficie y privacidad
 * ============================================================ */
test.describe("superficie", () => {
  test("los códigos de error son cerrados y con mensaje humano", () => {
    const result = read("src/lib/gallery-result.ts");
    const codes = [
      "forbidden", "not-found", "invalid-input", "rate-limited",
      "too-many-images", "rejected-file", "storage-failed", "unavailable",
    ];
    for (const c of codes) expect(result).toContain(`"${c}"`);
    expect(result).toContain("GALLERY_ERROR_MESSAGES");
    // El módulo "use server" sólo exporta funciones async (requisito de Next).
    const a = codeOf(ACTIONS());
    const badExports = a.match(/export (?!async function)(const|let|var|type|interface)/g) ?? [];
    expect(badExports.filter((e) => !e.includes("type") && !e.includes("interface"))).toEqual([]);
  });

  test("los logs no llevan PII ni nombres de archivo del usuario", () => {
    const a = codeOf(ACTIONS());
    const logs = a.match(/log\.\w+\("admin\/gallery"[\s\S]*?\}\);/g) ?? [];
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const l of logs) {
      for (const banned of ["file.name", "fileName", "email", "phone", "storagePath"]) {
        expect(l).not.toContain(banned);
      }
    }
  });

  test("hay rate limit en la carga", () => {
    const a = codeOf(ACTIONS());
    expect(a).toContain("rateLimit(");
    expect(a).toContain('code: "rate-limited"');
  });

  test("esta suite no toca Production: sólo fixtures y análisis estático", () => {
    // Los literales se arman por concatenación: si se escribieran enteros, el
    // propio archivo los contendría y el test se detectaría a sí mismo.
    const self = readFileSync(join(__dirname, "property-gallery-admin.spec.ts"), "utf8");
    expect(self).not.toContain("supabase" + ".co/");
    expect(self).not.toContain("grupovalterra" + ".com.ar");
    expect(self).not.toContain("page" + ".goto(");
    expect(self).not.toContain("request" + ".post(");
  });
});
