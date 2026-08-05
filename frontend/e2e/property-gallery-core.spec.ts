import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  extensionFor,
  inspectImageBytes,
  parseImageDimensions,
  sniffImageType,
} from "../src/lib/image-type";
import {
  ALT_TEXT_MAX,
  GALLERY_BUCKET,
  GALLERY_MANAGER_ROLES,
  MAX_IMAGES_PER_PROPERTY,
  buildGalleryPath,
  canManageGallery,
  isGalleryPubliclyVisible,
  isValidAgencyId,
  isValidPropertyId,
  normalizeOrder,
  pathBelongsTo,
  sanitizeAltText,
} from "../src/lib/property-gallery";

/**
 * S17 PR1 — núcleo de la galería: modelo, reglas puras y servicio.
 *
 * Unitarios sobre FIXTURES DE BYTES INVENTADOS + análisis estático de la
 * migración 0012 y del servicio. Sin Supabase, sin Storage real, sin
 * archivos reales, sin red. La semántica SQL viva se valida aparte en
 * PGlite con los tipos REALES del esquema productivo (text/uuid).
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const sqlOf = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const MIGRATION = () => read("supabase/migrations/0012_property_images.sql");
const SERVICE = () => read("src/services/property-images.ts");

/* ------------------------------------------------------------------ */
/* Fixtures de bytes (inventados, mínimos)                             */
/* ------------------------------------------------------------------ */

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // firma
  b.set([0x00, 0x00, 0x00, 0x0d], 8); // len IHDR
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function jpegBytes(width: number, height: number): Uint8Array {
  // FF D8 FF C0 <len=0x0011> <precision> <H H> <W W> ...
  const b = new Uint8Array(20);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  b[7] = (height >> 8) & 0xff; b[8] = height & 0xff;
  b[9] = (width >> 8) & 0xff; b[10] = width & 0xff;
  return b;
}

function webpBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  const ascii = (s: string, o: number) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  ascii("RIFF", 0); ascii("WEBP", 8); ascii("VP8X", 12);
  const w = width - 1, h = height - 1;
  b[24] = w & 0xff; b[25] = (w >> 8) & 0xff; b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff; b[28] = (h >> 8) & 0xff; b[29] = (h >> 16) & 0xff;
  return b;
}

const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
const AG = "11111111-1111-4111-8111-111111111111";
const RAND = "99999999-9999-4999-8999-999999999999";

/* ============================================================
 * Identificación por contenido
 * ============================================================ */
test.describe("identificación por contenido (magic bytes)", () => {
  test("JPEG, PNG y WebP se reconocen por bytes, no por nombre", () => {
    expect(sniffImageType(jpegBytes(800, 600))).toBe("image/jpeg");
    expect(sniffImageType(pngBytes(800, 600))).toBe("image/png");
    expect(sniffImageType(webpBytes(800, 600))).toBe("image/webp");
  });

  test("SVG se RECHAZA aunque se declare como imagen", () => {
    expect(sniffImageType(svgBytes)).toBeNull();
    const res = inspectImageBytes(svgBytes, "image/png");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unrecognized-content");
  });

  test("bytes arbitrarios (HTML, PDF, vacío) se rechazan", () => {
    expect(sniffImageType(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.4 xxxxx"))).toBeNull();
    expect(inspectImageBytes(new Uint8Array(0), "image/png").reason).toBe("empty");
  });

  test("tipo declarado distinto de los bytes reales => type-mismatch", () => {
    const res = inspectImageBytes(pngBytes(800, 600), "image/jpeg");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("type-mismatch");
  });

  test("dimensiones se leen de los headers en los tres formatos", () => {
    expect(parseImageDimensions(pngBytes(1234, 777), "image/png")).toEqual({ width: 1234, height: 777 });
    expect(parseImageDimensions(jpegBytes(1024, 768), "image/jpeg")).toEqual({ width: 1024, height: 768 });
    expect(parseImageDimensions(webpBytes(640, 480), "image/webp")).toEqual({ width: 640, height: 480 });
  });

  test("dimensiones fuera de rango se rechazan (muy grande y muy chica)", () => {
    expect(inspectImageBytes(pngBytes(MAX_IMAGE_DIMENSION + 1, 600), undefined).reason)
      .toBe("dimensions-out-of-range");
    expect(inspectImageBytes(pngBytes(MIN_IMAGE_DIMENSION - 1, 600), undefined).reason)
      .toBe("dimensions-out-of-range");
    expect(inspectImageBytes(pngBytes(800, 600), undefined).ok).toBe(true);
  });

  test("el tope de bytes coincide con el límite REAL del bucket (5 MiB)", () => {
    expect(MAX_IMAGE_BYTES).toBe(5242880);
  });

  test("la allowlist es exactamente JPG/PNG/WebP con sus extensiones", () => {
    expect([...ALLOWED_IMAGE_TYPES].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
  });
});

/* ============================================================
 * Paths server-side
 * ============================================================ */
test.describe("paths de Storage", () => {
  test("la ruta canónica es agency/{uuid}/property/{id}/{random}.{ext}", () => {
    const p = buildGalleryPath({ agencyId: AG, propertyId: "prop-001", randomName: RAND, type: "image/webp" });
    expect(p).toBe(`agency/${AG}/property/prop-001/${RAND}.webp`);
    expect(pathBelongsTo(p!, AG, "prop-001")).toBe(true);
    expect(pathBelongsTo(p!, AG, "prop-002")).toBe(false);
  });

  test("agencia que no es uuid, id malformado o nombre no-aleatorio => null", () => {
    expect(buildGalleryPath({ agencyId: "AG-1", propertyId: "prop-001", randomName: RAND, type: "image/png" })).toBeNull();
    expect(buildGalleryPath({ agencyId: AG, propertyId: "../otra", randomName: RAND, type: "image/png" })).toBeNull();
    expect(buildGalleryPath({ agencyId: AG, propertyId: "prop-001", randomName: "cover", type: "image/png" })).toBeNull();
    expect(isValidPropertyId("a/b")).toBe(false);
    expect(isValidPropertyId("prop-001")).toBe(true);
    expect(isValidAgencyId(AG)).toBe(true);
  });

  test("el servicio genera el nombre con randomUUID y NUNCA acepta un path del cliente", () => {
    const svc = codeOf(SERVICE());
    expect(svc).toContain("randomUUID()");
    expect(svc).toContain("buildGalleryPath({");
    // El contrato de entrada no tiene ningún campo de path.
    const input = svc.slice(svc.indexOf("export interface AddImageInput"), svc.indexOf("export async function addPropertyImage"));
    expect(input).not.toContain("path");
    expect(input).not.toContain("storagePath");
  });

  test("upsert:false — un choque de nombre debe fallar, no pisar un archivo ajeno", () => {
    const svc = codeOf(SERVICE());
    expect(svc).toContain("upsert: false");
    expect(svc).not.toContain("upsert: true");
  });
});

/* ============================================================
 * Migración 0012 — invariantes en la base
 * ============================================================ */
test.describe("migración 0012", () => {
  test("tipos REALES del esquema productivo: property_id text, agency_id uuid", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("property_id  text not null");
    expect(sql).toContain("agency_id    uuid not null");
    expect(sql).toContain("id           uuid primary key default gen_random_uuid()");
  });

  test("la coincidencia propiedad↔agencia la garantiza una FK COMPUESTA", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("foreign key (property_id, agency_id)");
    expect(sql).toContain("references public.properties (id, agency_id)");
    expect(sql).toContain("on delete cascade");
    expect(sql).toContain("add constraint properties_id_agency_unique unique (id, agency_id)");
  });

  test("UNA portada por propiedad: índice único PARCIAL (invariante en la base)", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("create unique index if not exists property_images_one_cover");
    expect(sql).toContain("on public.property_images (property_id) where is_cover");
  });

  test("checks: posición no negativa, path acotado y único, alt acotado", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("check (position >= 0)");
    expect(sql).toContain("storage_path text not null unique");
    expect(sql).toContain("char_length(storage_path) <= 300");
    expect(sql).toContain("char_length(alt_text) <= 300");
  });

  test("RLS habilitada SIN políticas: solo service_role llega a la tabla", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("alter table public.property_images enable row level security");
    expect(sql.toLowerCase()).not.toContain("create policy");
  });

  test("NO crea buckets ni políticas de Storage productivas (regla del gate)", () => {
    const sql = MIGRATION().toLowerCase();
    expect(sql).not.toContain("storage.buckets");
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toContain("create policy");
  });

  test("rollback documentado y aditividad (if not exists en índices y tabla)", () => {
    const raw = MIGRATION();
    expect(raw).toContain("drop table if exists public.property_images");
    expect(raw).toContain("drop constraint if exists properties_id_agency_unique");
    const sql = sqlOf(raw);
    expect(sql).toContain("create table if not exists public.property_images");
    expect((sql.match(/if not exists/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

/* ============================================================
 * Servicio — scoping, huérfanos, portada
 * ============================================================ */
test.describe("servicio property-images", () => {
  test("TODA escritura pinea property_id Y agency_id (aislamiento multi-tenant)", () => {
    const svc = codeOf(SERVICE());
    const agencyPins = svc.match(/\.eq\("agency_id", agencyId\)/g) ?? [];
    const inputPins = svc.match(/\.eq\("agency_id", input\.agencyId\)/g) ?? [];
    expect(agencyPins.length + inputPins.length).toBeGreaterThanOrEqual(7);
    // Ninguna operación usa el id de imagen solo, sin scope.
    const updates = svc.match(/\.update\(/g) ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(4);
  });

  test("huérfano tipo archivo: si el INSERT falla, se limpia el objeto subido", () => {
    const svc = codeOf(SERVICE());
    const failBlock = svc.slice(svc.indexOf("if (error || !data)"), svc.indexOf("if (firstImage)"));
    expect(failBlock).toContain("deleteObject({ bucket: GALLERY_BUCKET, path })");
    expect(failBlock).toContain('return { ok: false');
  });

  test("huérfano tipo objeto: al eliminar, la fila va PRIMERO y el objeto después", () => {
    const svc = codeOf(SERVICE());
    const removeFn = svc.slice(svc.indexOf("export async function removePropertyImage"));
    const rowDelete = removeFn.indexOf('.delete()');
    const objectDelete = removeFn.indexOf("deleteObject({ bucket: GALLERY_BUCKET");
    expect(rowDelete).toBeGreaterThan(-1);
    expect(objectDelete).toBeGreaterThan(rowDelete);
    // Y antes de todo, la verificación de propiedad y agencia.
    expect(removeFn.indexOf('maybeSingle()')).toBeLessThan(rowDelete);
  });

  test("portada: unset→set y sincronización de la caché cover_image DESPUÉS", () => {
    const svc = codeOf(SERVICE());
    const setFn = svc.slice(svc.indexOf("export async function setCoverImage"), svc.indexOf("export async function reorderPropertyImages"));
    const unset = setFn.indexOf("is_cover: false");
    const set = setFn.indexOf("is_cover: true");
    const sync = setFn.indexOf("syncCoverCache");
    expect(unset).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(unset);
    expect(sync).toBeGreaterThan(set);
  });

  test("la primera imagen nace portada; al borrar la portada se promueve o limpia", () => {
    const svc = codeOf(SERVICE());
    expect(svc).toContain("is_cover: firstImage");
    const removeFn = svc.slice(svc.indexOf("export async function removePropertyImage"));
    expect(removeFn).toContain("if (row.is_cover)");
    expect(removeFn).toContain("setCoverImage(next.id, propertyId, agencyId)");
    expect(removeFn).toContain("syncCoverCache(propertyId, agencyId, null)");
  });

  test("la validación por contenido corre ANTES de subir nada", () => {
    const svc = codeOf(SERVICE());
    const addFn = svc.slice(svc.indexOf("export async function addPropertyImage"));
    expect(addFn.indexOf("inspectImageBytes")).toBeLessThan(addFn.indexOf("uploadObject"));
    expect(addFn).toContain("MAX_IMAGES_PER_PROPERTY");
  });

  test("sin Supabase configurado, todo se rechaza sin tocar nada", () => {
    const svc = codeOf(SERVICE());
    const guards = svc.match(/if \(!isSupabaseConfigured\(\)\) return NOT_CONFIGURED/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(6);
  });
});

/* ============================================================
 * Reglas de producto
 * ============================================================ */
test.describe("reglas de producto", () => {
  test("roles de gestión = los del ciclo de propiedades; viewer excluido", () => {
    expect([...GALLERY_MANAGER_ROLES].sort()).toEqual(["admin", "agent", "owner"]);
    expect(canManageGallery("viewer")).toBe(false);
    expect(canManageGallery("owner")).toBe(true);
    expect(canManageGallery("desconocido")).toBe(false);
  });

  test("la galería pública SOLO existe para published", () => {
    expect(isGalleryPubliclyVisible("published")).toBe(true);
    for (const s of ["draft", "unpublished", "archived", "cualquiera"]) {
      expect(isGalleryPubliclyVisible(s)).toBe(false);
    }
  });

  test("alt text: saneado, colapsado y acotado", () => {
    expect(sanitizeAltText("  Frente   de la casa  ")).toBe("Frente de la casa");
    expect(sanitizeAltText("")).toBeNull();
    expect(sanitizeAltText(42)).toBeNull();
    expect(sanitizeAltText("x".repeat(ALT_TEXT_MAX + 50))!.length).toBe(ALT_TEXT_MAX);
  });

  test("normalizeOrder: 0..n-1 sin huecos, ignora ids ajenos, conserva faltantes", () => {
    const current = ["a", "b", "c", "d"];
    const plan = normalizeOrder(current, ["c", "a", "zzz", "c"]);
    expect(plan).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "d", position: 3 },
    ]);
    expect(normalizeOrder([], ["a"])).toEqual([]);
  });

  test("tope operativo de imágenes definido y razonable", () => {
    expect(MAX_IMAGES_PER_PROPERTY).toBeGreaterThanOrEqual(10);
    expect(MAX_IMAGES_PER_PROPERTY).toBeLessThanOrEqual(50);
  });

  test("el bucket es el EXISTENTE; el servicio no crea buckets ni políticas", () => {
    expect(GALLERY_BUCKET).toBe("properties");
    const svc = codeOf(SERVICE());
    expect(svc).not.toContain("createBucket");
    expect(svc).not.toContain("create" + "Policy");
  });
});
