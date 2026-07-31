import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

/**
 * Sprint 16 · PR-1 — configuración editable de agencia y fuente de leads.
 * Análisis estático + unitarios puros. Sin red, sin Supabase.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const require_ = Module.createRequire(__filename);

const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

test.describe("configuracion de agencia", () => {
  const actions = () => codeOf(read("app/admin/agencies/actions.ts"));

  test("solo owner/admin o super-admin pueden editar", () => {
    const code = actions();
    const idx = code.indexOf("export async function updateAgencyAction");
    const body = code.slice(idx);
    expect(body).toContain('["owner", "admin"].includes(m.role)');
    expect(body).toContain("ctx.isSuperAdmin");
  });

  test("la agencia objetivo se verifica contra las memberships de la sesion", () => {
    const code = actions();
    const idx = code.indexOf("export async function updateAgencyAction");
    const body = code.slice(idx);
    // el id no viene del formulario: se resuelve por slug y se chequea pertenencia
    expect(body).toContain("m.agencyId === agency.id");
    expect(body).not.toContain('formData.get("agencyId")');
    expect(body).not.toContain('formData.get("agency_id")');
  });

  test("el slug no es editable", () => {
    const svc = codeOf(read("services/agencies.ts"));
    const idx = svc.indexOf("export async function updateAgency");
    const body = svc.slice(idx, idx + 2500);
    expect(body).not.toContain('"slug"');
    expect(body).not.toContain("slug:");
  });

  test("contact_email se valida y no puede quedar vacio", () => {
    const code = actions();
    const idx = code.indexOf("export async function updateAgencyAction");
    const body = code.slice(idx);
    expect(body).toContain("AGENCY_EMAIL_RX.test(contactEmail)");
    expect(body).toContain("if (!contactEmail)");
  });

  test("el cambio queda auditado con campos y actor, sin valores", () => {
    const svc = codeOf(read("services/agencies.ts"));
    const idx = svc.indexOf('"agency actualizada"');
    expect(idx).toBeGreaterThan(-1);
    const call = svc.slice(idx, idx + 300);
    expect(call).toContain("fields: Object.keys(clean)");
    expect(call).toContain("updatedBy");
  });
});

test.describe("fuente de leads", () => {
  test("con propiedad → 'Consulta por propiedad'; sin propiedad → 'Consulta general'", () => {
    const src = codeOf(read("components/admin/leads/LeadTable.tsx"));
    expect(src).toContain('"contact-form": "Consulta general"');
    expect(src).toContain('return "Consulta por propiedad"');
    expect(src).not.toContain("Form propiedad");
  });

  test("la derivacion usa property_slug del lead, sin tocar datos", () => {
    const src = codeOf(read("components/admin/leads/LeadTable.tsx"));
    expect(src).toContain("propertySlug={lead.property_slug}");
  });
});
