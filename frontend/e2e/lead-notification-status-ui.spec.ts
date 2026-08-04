import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTENTION_STATUSES,
  DEFAULT_NOTIFY_FILTER,
  NOTIFY_FILTERS,
  activeFilterCount,
  applyLeadFilters,
  countAttention,
  matchesNotifyFilter,
  parseLeadListFilters,
  parseLeadSearch,
  parseLeadStatusFilter,
  parseNotifyFilter,
} from "../src/lib/admin-lead-filter";
import { NOTIFY_TONE_CLASS, notifyBadge } from "../src/lib/lead-notify-view";
import {
  LEAD_NOTIFY_STATUSES,
  toLeadNotifyStatus,
  type Lead,
  type LeadNotifyStatus,
} from "../src/services/mock-leads";

/**
 * S16-LEAD-OBS PR2 — estado del aviso visible en la bandeja.
 *
 * Unitarios puros sobre fixtures inventados + análisis estático de la UI.
 * Sin Supabase, sin red, sin leads reales.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** Fixture mínimo: sólo lo que el filtro y el badge necesitan. */
function lead(over: Partial<Lead> & { id: string }): Lead {
  return {
    name: "Persona de Prueba",
    phone: "+54 9 000 000-0000",
    source: "contact-form",
    status: "new",
    message: "consulta de prueba para el fixture",
    createdAt: new Date().toISOString(),
    notifyStatus: "unknown",
    notifyAttempts: 0,
    ...over,
  } as Lead;
}

const HISTORICOS = Array.from({ length: 9 }, (_, i) =>
  lead({ id: `LEAD-HIST-${i}`, notifyStatus: "unknown", notifyReason: "legacy-unknown" }),
);

/* ============================================================
 * Contrato de tipos
 * ============================================================ */
test.describe("contrato de tipos", () => {
  test("1. LeadRow mapea snake_case a camelCase en el dominio", () => {
    const svc = codeOf(read("services/mock-leads.ts"));
    for (const col of [
      "notify_status",
      "notify_attempts",
      "notify_last_at",
      "notify_reason",
      "notify_message_id",
    ]) {
      expect(svc).toContain(col);
    }
    for (const field of [
      "notifyStatus",
      "notifyAttempts",
      "notifyLastAt",
      "notifyReason",
      "notifyMessageId",
    ]) {
      expect(svc).toContain(field);
    }
    // La consulta debe pedir las columnas: si no, el panel nunca las ve.
    const select = svc.slice(svc.indexOf(".select("), svc.indexOf(".order("));
    expect(select).toContain("notify_status");
    expect(select).toContain("notify_message_id");
  });

  test("2. los cinco estados aceptados, y ninguno más", () => {
    expect([...LEAD_NOTIFY_STATUSES]).toEqual([
      "unknown",
      "pending",
      "sent",
      "failed",
      "skipped",
    ]);
  });

  test("2b. un valor inesperado se normaliza a unknown, nunca a sent", () => {
    for (const raw of ["enviado", "SENT", "", null, undefined, 42, {}]) {
      expect(toLeadNotifyStatus(raw)).toBe("unknown");
    }
    expect(toLeadNotifyStatus("sent")).toBe("sent");
  });

  test("2c. el estado desconocido se registra saneado, sin volcar el valor crudo", () => {
    const svc = codeOf(read("services/mock-leads.ts"));
    const start = svc.indexOf('log.warn("leads", "notify_status fuera de contrato');
    expect(start).toBeGreaterThan(-1);
    // Sólo la llamada al log, no el resto del archivo.
    const warn = svc.slice(start, svc.indexOf(");", start) + 1);
    expect(warn).toContain("leadId");
    // Ni el valor crudo ni ningún dato del lead más allá del id.
    expect(warn).not.toContain("row.notify_status");
    expect(warn).not.toContain("email");
    expect(warn).not.toContain("phone");
    expect(warn).not.toContain("name");
  });
});

/* ============================================================
 * Semántica visual
 * ============================================================ */
test.describe("badges", () => {
  test("3. sent muestra 'Avisado'", () => {
    const b = notifyBadge("sent");
    expect(b.label).toBe("Avisado");
    expect(b.tone).toBe("ok");
  });

  test("4. pending muestra 'Pendiente de aviso'", () => {
    expect(notifyBadge("pending").label).toBe("Pendiente de aviso");
  });

  test("5. failed muestra explicación saneada por categoría", () => {
    expect(notifyBadge("failed", "provider-timeout").explanation).toBe(
      "El proveedor no respondió a tiempo.",
    );
    expect(notifyBadge("failed", "provider-5xx").explanation).toBe(
      "El proveedor tuvo un error temporal.",
    );
    expect(notifyBadge("failed", "provider-rejected").explanation).toBe(
      "El proveedor rechazó el envío.",
    );
    expect(notifyBadge("failed", "unknown").explanation).toBe(
      "No se pudo determinar la causa.",
    );
    // Categoría inesperada: explica sin inventar una causa.
    expect(notifyBadge("failed", "algo-raro").explanation).toBe(
      "No se pudo determinar la causa.",
    );
    expect(notifyBadge("failed").label).toBe("Falló el aviso");
  });

  test("6. skipped muestra explicación saneada", () => {
    expect(notifyBadge("skipped", "no-api-key").explanation).toBe(
      "El servicio de correo no está configurado.",
    );
    expect(notifyBadge("skipped", "no-recipients").explanation).toBe(
      "La agencia no tiene destinatario configurado.",
    );
    expect(notifyBadge("skipped").label).toBe("No enviado");
  });

  test("7. unknown muestra 'Histórico · sin evidencia'", () => {
    const b = notifyBadge("unknown", "legacy-unknown");
    expect(b.label).toBe("Histórico · sin evidencia");
    expect(b.explanation).toContain("anterior al registro de notificaciones");
    expect(b.explanation).toContain("No se sabe con certeza");
  });

  test("8. unknown NO usa tratamiento de error", () => {
    const b = notifyBadge("unknown");
    expect(b.tone).toBe("neutral");
    expect(b.tone).not.toBe("error");
    // Ni rojo ni ámbar: gris.
    expect(NOTIFY_TONE_CLASS[b.tone]).toContain("slate");
    expect(NOTIFY_TONE_CLASS[b.tone]).not.toContain("red");
    expect(NOTIFY_TONE_CLASS[b.tone]).not.toContain("amber");
    // Y no se lo nombra como pendiente, fallido ni por enviar.
    expect(b.label.toLowerCase()).not.toContain("pendiente");
    expect(b.label.toLowerCase()).not.toContain("falló");
    expect(b.label.toLowerCase()).not.toContain("reintent");
  });

  test("todos los estados tienen etiqueta y explicación", () => {
    for (const s of LEAD_NOTIFY_STATUSES) {
      const b = notifyBadge(s as LeadNotifyStatus);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.explanation.length).toBeGreaterThan(0);
    }
  });
});

/* ============================================================
 * Filtros
 * ============================================================ */
test.describe("filtro de aviso", () => {
  test("9. attention incluye pending, failed y skipped", () => {
    for (const s of ["pending", "failed", "skipped"] as LeadNotifyStatus[]) {
      expect(matchesNotifyFilter(s, "attention")).toBe(true);
    }
    expect([...ATTENTION_STATUSES].sort()).toEqual(["failed", "pending", "skipped"]);
  });

  test("10. attention EXCLUYE unknown", () => {
    expect(matchesNotifyFilter("unknown", "attention")).toBe(false);
    expect(ATTENTION_STATUSES).not.toContain("unknown");
    expect(countAttention(HISTORICOS)).toBe(0);
  });

  test("11. attention excluye sent", () => {
    expect(matchesNotifyFilter("sent", "attention")).toBe(false);
  });

  test("12. el filtro unknown devuelve los históricos", () => {
    const out = applyLeadFilters(HISTORICOS, {
      q: "",
      estado: "all",
      aviso: "unknown",
    });
    expect(out).toHaveLength(9);
  });

  test("13. un valor inválido vuelve a all", () => {
    for (const raw of ["", "todos", "ATTENTION", "../etc", null, undefined, 7, ["sent"]]) {
      expect(parseNotifyFilter(raw)).toBe(DEFAULT_NOTIFY_FILTER);
    }
    for (const v of NOTIFY_FILTERS) expect(parseNotifyFilter(v)).toBe(v);
  });

  test("cada estado puntual devuelve sólo el suyo", () => {
    const mixed = LEAD_NOTIFY_STATUSES.map((s) =>
      lead({ id: `L-${s}`, notifyStatus: s as LeadNotifyStatus }),
    );
    for (const s of LEAD_NOTIFY_STATUSES) {
      const out = applyLeadFilters(mixed, { q: "", estado: "all", aviso: s });
      expect(out).toHaveLength(1);
      expect(out[0].notifyStatus).toBe(s);
    }
  });
});

test.describe("combinación de filtros", () => {
  const dataset = [
    lead({ id: "L1", name: "Ana Gómez", notifyStatus: "failed", status: "new" }),
    lead({ id: "L2", name: "Ana Pérez", notifyStatus: "sent", status: "new" }),
    lead({ id: "L3", name: "Beto Ruiz", notifyStatus: "failed", status: "contacted" }),
    ...HISTORICOS,
  ];

  test("14. búsqueda y aviso se combinan con AND", () => {
    const out = applyLeadFilters(dataset, { q: "ana", estado: "all", aviso: "failed" });
    expect(out.map((l) => l.id)).toEqual(["L1"]);
  });

  test("14b. la búsqueda ignora acentos y mayúsculas, y no toca el mensaje", () => {
    const acentuado = [lead({ id: "L9", name: "Andrés Núñez", message: "zzz secreto zzz" })];
    expect(applyLeadFilters(acentuado, { q: "ANDRES", estado: "all", aviso: "all" })).toHaveLength(1);
    expect(applyLeadFilters(acentuado, { q: "nunez", estado: "all", aviso: "all" })).toHaveLength(1);
    // El mensaje no es campo buscable.
    expect(applyLeadFilters(acentuado, { q: "secreto", estado: "all", aviso: "all" })).toHaveLength(0);
  });

  test("14c. el estado del lead se combina con el aviso", () => {
    const out = applyLeadFilters(dataset, { q: "", estado: "contacted", aviso: "failed" });
    expect(out.map((l) => l.id)).toEqual(["L3"]);
  });

  test("15. cambiar un filtro conserva los otros parámetros en la URL", () => {
    const src = codeOf(read("components/admin/leads/LeadFilters.tsx"));
    // El handler del select de aviso arrastra q y estado; el de estado arrastra q y aviso.
    expect(src).toContain("estado: filters.estado, aviso: e.target.value");
    expect(src).toContain("estado: e.target.value, aviso: filters.aviso");
    // Y la búsqueda vigente se lee del input, no del valor ya renderizado.
    expect(src).toContain("currentQ()");
  });

  test("15b. el default no se escribe en la URL", () => {
    const src = codeOf(read("components/admin/leads/LeadFilters.tsx"));
    expect(src).toContain("next.aviso !== DEFAULT_NOTIFY_FILTER");
    expect(src).toContain("next.estado !== DEFAULT_LEAD_STATUS_FILTER");
  });

  test("parseo conjunto y contador de filtros activos", () => {
    expect(parseLeadListFilters({ q: "  hola   mundo ", estado: "new", aviso: "attention" })).toEqual({
      q: "hola mundo",
      estado: "new",
      aviso: "attention",
    });
    expect(parseLeadListFilters({})).toEqual({ q: "", estado: "all", aviso: "all" });
    expect(activeFilterCount({ q: "", estado: "all", aviso: "all" })).toBe(0);
    expect(activeFilterCount({ q: "x", estado: "new", aviso: "failed" })).toBe(3);
    // Término desmedido: se acota.
    expect(parseLeadSearch("a".repeat(500))).toHaveLength(80);
    expect(parseLeadStatusFilter("inventado")).toBe("all");
  });
});

/* ============================================================
 * Privacidad y alcance
 * ============================================================ */
test.describe("privacidad y alcance", () => {
  test("16. ningún mensaje crudo del proveedor llega al DOM", () => {
    const view = codeOf(read("lib/lead-notify-view.ts"));
    // Las explicaciones son literales nuestros; no se interpola nada del proveedor.
    expect(view).not.toContain("${reason}");
    expect(view).not.toContain("providerError");
    expect(view).not.toContain("statusCode");
    const table = codeOf(read("components/admin/leads/LeadTable.tsx"));
    expect(table).not.toContain("notifyMessageId");
  });

  test("17. notify_message_id no se muestra en la UI", () => {
    for (const f of [
      "components/admin/leads/LeadTable.tsx",
      "components/admin/leads/LeadsDashboard.tsx",
      "components/admin/leads/LeadFilters.tsx",
    ]) {
      expect(codeOf(read(f))).not.toContain("MessageId");
    }
  });

  test("18. no existe botón de reintento en PR2", () => {
    for (const f of [
      "components/admin/leads/LeadTable.tsx",
      "components/admin/leads/LeadsDashboard.tsx",
      "components/admin/leads/LeadFilters.tsx",
      "app/admin/leads/page.tsx",
    ]) {
      const src = codeOf(read(f));
      expect(src).not.toContain("Reintentar");
      expect(src).not.toContain("notifyNewLead");
      expect(src).not.toContain("processLeadNotification");
    }
  });

  test("19. el scoping por agencia sigue intacto y no viene del cliente", () => {
    const page = codeOf(read("app/admin/leads/page.tsx"));
    expect(page).toContain("ctx.scopedAgencyId ? { agencyId: ctx.scopedAgencyId } : {}");
    // Los filtros de la URL no tocan la agencia: se mira SÓLO esa llamada,
    // porque más abajo el archivo usa agencyId de forma legítima (isOwner).
    const start = page.indexOf("parseLeadListFilters(");
    expect(start).toBeGreaterThan(-1);
    const filtersCall = page.slice(start, page.indexOf(";", start));
    expect(filtersCall).not.toContain("agencyId");
    expect(filtersCall).not.toContain("agency");
    expect(page).not.toContain("sp.agencyId");
    expect(page).not.toContain("sp.agency");
  });

  test("19b. el filtrado se aplica sobre lo que el servicio ya acotó", () => {
    const page = codeOf(read("app/admin/leads/page.tsx"));
    const iLeads = page.indexOf("await getAllLeads(");
    const iFilter = page.indexOf("applyLeadFilters(");
    expect(iLeads).toBeGreaterThan(-1);
    expect(iFilter).toBeGreaterThan(iLeads);
  });
});

/* ============================================================
 * Presentación
 * ============================================================ */
test.describe("presentación", () => {
  test("20. desktop y móvil muestran el estado del aviso", () => {
    const table = codeOf(read("components/admin/leads/LeadTable.tsx"));
    expect((table.match(/<NotifyBadge/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(table).toContain("<th className=\"px-4 py-3\">Aviso</th>");
    // En móvil la explicación va visible, porque no hay hover.
    expect(table).toContain("notifyBadge(lead.notifyStatus, lead.notifyReason).explanation");
  });

  test("21. estado vacío explícito cuando el filtro no deja nada", () => {
    const table = codeOf(read("components/admin/leads/LeadTable.tsx"));
    expect(table).toContain("leads.length === 0");
    expect(table).toContain("No hay consultas que coincidan con los filtros");
  });

  test("22. los históricos no se cuentan como 'requieren atención'", () => {
    expect(countAttention(HISTORICOS)).toBe(0);
    const dash = codeOf(read("components/admin/leads/LeadsDashboard.tsx"));
    expect(dash).toContain("attentionCount");
    // El contador se calcula sobre el scope completo, no sobre la vista filtrada.
    const page = codeOf(read("app/admin/leads/page.tsx"));
    expect(page).toContain("countAttention(leads)");
    expect(page).not.toContain("countAttention(visibleLeads)");
  });

  test("el conteo de la cabecera distingue vista filtrada de total", () => {
    const dash = codeOf(read("components/admin/leads/LeadsDashboard.tsx"));
    expect(dash).toContain("totalInScope");
    expect(dash).toContain("isFiltered");
  });
});
