import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMPAIGN_REF_RE,
  INTAKE_SOURCES,
  LEAD_PIPELINE,
  LEAD_STATUS_LABEL,
  NAME_FALLBACK,
  NOTE_FALLBACK,
  buildIntakeMessage,
  extractCampaignRef,
  isLeadStatus,
  normalizeArPhone,
  normalizeCampaignRef,
  validateIntake,
} from "../src/lib/lead-intake";

/**
 * S28 PR-A — intake manual de consultas WhatsApp + cambio de estado.
 *
 * Unitarios PUROS sobre `lib/lead-intake` + análisis estático de la server
 * action, el servicio, la UI y la migración 0001 (CHECKs reales). Sin red,
 * sin Supabase, sin navegador. Probada por mutación (ver LOOP/BITACORA).
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Código sin comentarios: una guarda que lee comentarios da falso verde. */
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const sqlOf = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// ------------------------------------------------------------
// Campaign ref
// ------------------------------------------------------------
test.describe("campaign ref (DEC-01)", () => {
  test("acepta el código limpio y lo canoniza", () => {
    expect(normalizeCampaignRef("GV-W36-COLO-XL")).toBe("GV-W36-COLO-XL");
    expect(normalizeCampaignRef("gv-w36-colo-xl")).toBe("GV-W36-COLO-XL");
    expect(normalizeCampaignRef("  GV-P05-LAGSOTO ")).toBe("GV-P05-LAGSOTO");
    expect(normalizeCampaignRef("GV-W37-CAPTACION-OWNER")).toBe("GV-W37-CAPTACION-OWNER");
  });
  test("acepta lo que se pega desde WhatsApp con prefijo Ref", () => {
    expect(normalizeCampaignRef("Ref: GV-W36-COLO-XL")).toBe("GV-W36-COLO-XL");
    expect(normalizeCampaignRef("ref GV-W36-COLO-XL")).toBe("GV-W36-COLO-XL");
    expect(normalizeCampaignRef("Referencia: gv w36 colo xl")).toBe("GV-W36-COLO-XL");
    expect(normalizeCampaignRef("REF=GV_W36_COLO_XL")).toBe("GV-W36-COLO-XL");
  });
  test("rechaza lo que no es un código", () => {
    for (const bad of ["", "   ", "hola", "GV-", "GV-W36", "XX-W36-COLO", "GV-W36-COLO-XL-EXTRA-MAS", "GV-W36-COLÓ", 42, null, undefined]) {
      expect(normalizeCampaignRef(bad), String(bad)).toBeNull();
    }
    expect(normalizeCampaignRef("GV-W36-" + "A".repeat(30))).toBeNull();
  });
  test("la regex publicada es la que decide", () => {
    expect(CAMPAIGN_REF_RE.test("GV-W36-COLO-XL")).toBe(true);
    expect(CAMPAIGN_REF_RE.test("gv-w36-colo-xl")).toBe(false);
  });
  test("va y vuelve por el mensaje", () => {
    const msg = buildIntakeMessage("Quiere ver el depto del centro", "GV-W36-COLO-XL");
    expect(msg).toBe("Quiere ver el depto del centro\nRef: GV-W36-COLO-XL");
    expect(extractCampaignRef(msg)).toBe("GV-W36-COLO-XL");
    expect(extractCampaignRef("sin ref")).toBeNull();
    expect(extractCampaignRef(null)).toBeNull();
    // Solo la ÚLTIMA línea cuenta: una ref en el medio del texto no se toma.
    expect(extractCampaignRef("Ref: GV-W36-COLO-XL\nmás texto")).toBeNull();
  });
  test("la nota corta se completa para pasar el CHECK de 10 caracteres", () => {
    expect(buildIntakeMessage("", null)).toBe(NOTE_FALLBACK);
    expect(buildIntakeMessage("ok", null)).toBe(`ok — ${NOTE_FALLBACK}`);
    expect(buildIntakeMessage("ok", "GV-W36-COLO-XL").length).toBeGreaterThanOrEqual(10);
  });
});

// ------------------------------------------------------------
// Teléfono
// ------------------------------------------------------------
test.describe("teléfono argentino", () => {
  const CANON = { stored: "+5493794123456", waDigits: "5493794123456", canonical: true };
  test("todas las formas habituales convergen al mismo canónico", () => {
    for (const raw of [
      "+54 9 379 412-3456",
      "+5493794123456",
      "549 379 4123456",
      "54 379 4123456",
      "0379 15 412 3456",
      "0379 4123456",
      "379 412 3456",
      "3794123456",
      "0054 9 379 4123456",
    ]) {
      expect(normalizeArPhone(raw), raw).toEqual(CANON);
    }
  });
  test("un número que no entiende se guarda tal cual, sin inventar", () => {
    const r = normalizeArPhone("+1 305 555 0100");
    expect(r?.canonical).toBe(false);
    expect(r?.waDigits).toBeNull();
    expect(r?.stored).toBe("+1 305 555 0100");
  });
  test("con 9 u 11 dígitos locales NO inventa un canónico (falta o sobra un dígito)", () => {
    for (const raw of ["379412345", "37941234567", "+54 379 41234"]) {
      const r = normalizeArPhone(raw);
      expect(r?.canonical, raw).toBe(false);
      expect(r?.waDigits, raw).toBeNull();
      expect(r?.stored, raw).toBe(raw);
    }
  });
  test("recorta a 20 y rechaza menos de 8 (CHECK de la base)", () => {
    expect(normalizeArPhone("1234567")).toBeNull();
    expect(normalizeArPhone("")).toBeNull();
    expect(normalizeArPhone(null)).toBeNull();
    const largo = normalizeArPhone("+54 (0379) 15-412-3456 int 22");
    expect(largo?.stored.length).toBeLessThanOrEqual(20);
  });
});

// ------------------------------------------------------------
// Pipeline y origen: SOLO valores que la migración 0001 acepta
// ------------------------------------------------------------
test.describe("pipeline y origen vs. CHECKs reales", () => {
  const sql = sqlOf(read("supabase/migrations/0001_create_leads.sql"));
  const checkValues = (col: string): string[] => {
    const m = new RegExp(`${col}\\s+text[^,]*?check\\s*\\(\\s*${col}\\s+in\\s*\\(([^)]*)\\)`, "is").exec(sql);
    if (!m) throw new Error(`CHECK de ${col} no encontrado en 0001`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  test("cada estado del pipeline existe en leads_status_check", () => {
    const allowed = checkValues("status");
    for (const s of LEAD_PIPELINE) expect(allowed, s).toContain(s);
    expect(new Set(LEAD_PIPELINE).size).toBe(LEAD_PIPELINE.length);
    for (const s of LEAD_PIPELINE) expect(LEAD_STATUS_LABEL[s]).toBeTruthy();
  });
  test("cada origen del alta existe en leads_source_check", () => {
    const allowed = checkValues("source");
    for (const s of INTAKE_SOURCES) expect(allowed, s).toContain(s);
  });
  test("isLeadStatus no acepta valores inventados", () => {
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("won")).toBe(false);
    expect(isLeadStatus("reserved")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus(1)).toBe(false);
  });
});

// ------------------------------------------------------------
// validateIntake — los seis casos del brief (§17)
// ------------------------------------------------------------
test.describe("validateIntake", () => {
  test("consulta con propiedad, ref y teléfono canónico", () => {
    const v = validateIntake({
      name: "Juan",
      phone: "+54 9 379 412-3456",
      propertySlug: "depto-centro",
      source: "whatsapp",
      campaignRef: "Ref: GV-W36-COLO-XL",
      note: "Quiere visitar el sábado",
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.propertySlug).toBe("depto-centro");
    expect(v.data.campaignRef).toBe("GV-W36-COLO-XL");
    expect(v.data.phone.stored).toBe("+5493794123456");
    expect(v.data.message).toBe("Quiere visitar el sábado\nRef: GV-W36-COLO-XL");
  });
  test("consulta general: sin propiedad, sin ref, sin nombre, teléfono imperfecto", () => {
    const v = validateIntake({ phone: "379 412 3456", note: "" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.propertySlug).toBeNull();
    expect(v.data.campaignRef).toBeNull();
    expect(v.data.name).toBe(NAME_FALLBACK);
    expect(v.data.source).toBe("whatsapp");
    expect(v.data.message).toBe(NOTE_FALLBACK);
  });
  test("sin teléfono no hay alta", () => {
    expect(validateIntake({ name: "Ana" })).toEqual({ ok: false, error: "telefono-faltante" });
  });
  test("ref mal formada se rechaza con código claro (vacía se acepta)", () => {
    expect(validateIntake({ phone: "3794123456", campaignRef: "hola" })).toEqual({ ok: false, error: "ref-invalida" });
    expect(validateIntake({ phone: "3794123456", campaignRef: "   " }).ok).toBe(true);
  });
  test("origen inventado o slug raro se rechazan", () => {
    expect(validateIntake({ phone: "3794123456", source: "meta" })).toEqual({ ok: false, error: "source-invalida" });
    expect(validateIntake({ phone: "3794123456", source: "contact-form" })).toEqual({ ok: false, error: "source-invalida" });
    expect(validateIntake({ phone: "3794123456", propertySlug: "../x" })).toEqual({ ok: false, error: "propiedad-invalida" });
  });
  test("inputs inesperados no rompen", () => {
    expect(validateIntake({ phone: 3794123456 as unknown })).toEqual({ ok: false, error: "telefono-faltante" });
    const v = validateIntake({ phone: "3794123456", name: "x".repeat(500), note: "y".repeat(5000) });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.name.length).toBeLessThanOrEqual(100);
    expect(v.data.message.length).toBeLessThanOrEqual(1000);
  });
});

// ------------------------------------------------------------
// Análisis estático: la acción decide sola, la UI no autoriza
// ------------------------------------------------------------
test.describe("server action y cableado", () => {
  const action = codeOf(read("src/app/admin/leads/intake-actions.ts"));
  const retryAction = codeOf(read("src/app/admin/leads/actions.ts"));
  const service = codeOf(read("src/services/mock-leads.ts"));
  const page = codeOf(read("src/app/admin/leads/page.tsx"));
  const table = codeOf(read("src/components/admin/leads/LeadTable.tsx"));
  const form = codeOf(read("src/components/admin/leads/NewLeadForm.tsx"));

  test("las dos acciones existen, son server actions y NO viven en actions.ts (contrato S16)", () => {
    expect(action.startsWith('"use server"')).toBe(true);
    expect(retryAction).not.toMatch(/createWhatsappLeadAction|updateLeadStatusAction/);
    expect(action).toMatch(/export async function createWhatsappLeadAction\(formData: FormData\)/);
    expect(action).toMatch(/export async function updateLeadStatusAction\(/);
  });
  test("la autorización sale de la sesión: roles cerrados y agencia nunca del cliente", () => {
    expect(action).toMatch(/const WRITE_ROLES = new Set\(\["owner", "admin", "agent"\]\)/);
    expect(action).toMatch(/if \(!ctx\.userId \|\| !ctx\.scopedAgencyId\) return \{ ok: false \}/);
    expect(action).not.toMatch(/formData\.get\("agencyId"\)/);
    expect(action).not.toMatch(/formData\.get\("status"\)/);
  });
  test("el alta revalida con validateIntake y el estado con isLeadStatus", () => {
    expect(action).toMatch(/const v = validateIntake\(\{/);
    expect(action).toMatch(/if \(!v\.ok\) return \{ result: "invalid", error: v\.error \}/);
    expect(action).toMatch(/if \(!isLeadStatus\(statusRaw\)\) return \{ result: "invalid" \}/);
  });
  test("la propiedad se verifica contra la agencia y el alta no depende de ella", () => {
    expect(action).toMatch(/getPropertyBySlug\(v\.data\.propertySlug, \{ includeDraft: true \}\)/);
    expect(action).toMatch(/p\.agencyId === who\.agencyId/);
  });
  test("el cambio de estado va scopeado por agencia para no super-admin", () => {
    expect(action).toMatch(/who\.isSuperAdmin \? \{\} : \{ agencyId: who\.agencyId \?\? undefined \}/);
    expect(service).toMatch(/if \(scope\.agencyId\) query = query\.eq\("agency_id", scope\.agencyId\)/);
    expect(service).toMatch(/\.update\(\{ status \}\)/);
    // updated_at lo pone el trigger, no el servicio.
    expect(service).not.toMatch(/updated_at/);
  });
  test("la página deriva canWrite de la sesión y la tabla lo respeta", () => {
    expect(page).toMatch(/m\.role === "owner" \|\| m\.role === "admin" \|\| m\.role === "agent"/);
    expect(page).toMatch(/allowSampleFallback: false/);
    expect(table).toMatch(/canWrite \? \(\s*<LeadStatusSelect/);
    expect((table.match(/<LeadStatusSelect leadId=\{lead\.id\} status=\{lead\.status\} \/>/g) ?? []).length).toBe(2);
  });
  test("el formulario manda exactamente los seis campos del brief", () => {
    for (const n of ["phone", "name", "source", "propertySlug", "campaignRef", "note"]) {
      expect(form, n).toMatch(new RegExp(`name="${n}"`));
    }
    expect(form).toMatch(/Consulta general \/ sin propiedad/);
    expect(form).toMatch(/required/);
  });
  test("ninguna migración nueva fue necesaria para PR-A", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(join(ROOT, "supabase/migrations"));
    expect(files.some((f: string) => /^002[01]_/.test(f))).toBe(false);
  });
});
