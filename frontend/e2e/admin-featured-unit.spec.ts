import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S19 — destacadas de portada + ámbito multi-inmobiliaria.
 * Guardas estáticas: permisos, scoping y contrato con la home.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test.describe("action de destacadas", () => {
  const actions = read("app/admin/properties/actions.ts");
  const block = actions.slice(actions.indexOf("setPropertyFeaturedAction"));

  test("exige rol manager (mismo que publicar/archivar)", () => {
    expect(block).toContain('requireAgencyPermission(ctx, "manage"');
    expect(actions).toContain('const MANAGER_ROLES = ["owner", "admin"] as const');
  });

  test("la agencia se resuelve server-side, no llega del cliente", () => {
    expect(block).not.toMatch(/formData\.get\(["']agency/);
    expect(block).toContain("property.agencyId");
  });

  test("revalida portada y listado público", () => {
    expect(block).toContain('revalidatePath("/")');
    expect(block).toContain('revalidatePath("/propiedades")');
  });
});

test.describe("servicio setPropertyFeatured", () => {
  const svc = read("services/properties.ts");
  const fn = svc.slice(svc.indexOf("export async function setPropertyFeatured"));

  test("scoped por id + agency_id y solo toca featured", () => {
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain('.eq("id", args.id)');
    expect(body).toContain('.eq("agency_id", args.agencyId)');
    const update = body.slice(body.indexOf(".update("), body.indexOf("})", body.indexOf(".update(")));
    for (const forbidden of ["status", "published", "price", "title", "cover_image"]) {
      expect(update).not.toContain(forbidden);
    }
  });

  test("no filtra el mensaje crudo del proveedor", () => {
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toMatch(/error:\s*error\.message/);
  });
});

test.describe("listado admin", () => {
  const page = read("app/admin/properties/page.tsx");

  test("solo el super-admin puede ver todas las inmobiliarias", () => {
    expect(page).toContain('ctx.isSuperAdmin && params.ambito === "todas"');
    // Un miembro común siempre queda restringido a su agencia.
    expect(page).toMatch(/if \(!wantsAllAgencies && ctx\.scopedAgencyId\)/);
  });

  test("los permisos se evalúan por agencia de cada fila", () => {
    expect(page).toContain("canManageAgency(p.agencyId)");
    expect(page).toContain("const canManageAgency");
  });

  test("muestra el toggle de portada y el badge", () => {
    expect(page).toContain("<PropertyFeaturedToggle");
    expect(page).toContain("★ Portada");
  });
});

test.describe("la home consume featured", () => {
  test("getFeaturedProperties filtra featured y solo publicadas", () => {
    const svc = read("services/properties.ts");
    expect(svc).toContain("getAllProperties({ featured: true");
    const homePage = read("app/page.tsx");
    expect(homePage).toContain("getFeaturedProperties(");
  });

  test("el toggle avisa si la propiedad no está publicada", () => {
    const toggle = read("app/admin/properties/PropertyFeaturedToggle.tsx");
    expect(toggle).toContain("Publicala para que se vea");
    expect(toggle).toContain('"use client"');
  });
});
