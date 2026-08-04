import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RETRY_AMBIGUOUS_WARNING,
  RETRY_CLAIM_STALE_MS,
  RETRY_ELIGIBLE_STATUSES,
  RETRY_IDEMPOTENCY_WINDOW_MS,
  RETRY_RESULTS,
  RETRY_RESULT_MESSAGES,
  canActorRetryLead,
  isAmbiguousRetry,
  isRetryEligibleStatus,
  isRetryResult,
  isStalePendingClaim,
  skippedRetryWarning,
  type RetryActorView,
} from "../src/lib/lead-notify-retry";
import { LEAD_NOTIFY_STATUSES } from "../src/services/mock-leads";

/**
 * S16-LEAD-OBS PR3 — reintento manual controlado del aviso.
 *
 * Unitarios PUROS sobre las reglas + análisis estático de la acción, el
 * servicio, la migración 0011 y la UI. Requisito 35 del gate: esta suite no
 * usa Resend, ni Supabase Production, ni red — la semántica SQL real se
 * valida aparte en Postgres desechable (PGlite), fuera del commit.
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
/** Sólo el código SQL: sin comentarios de línea. */
const sqlOf = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const ACTION = () => read("src/app/admin/leads/actions.ts");
const SERVICE = () => read("src/services/lead-notifications.ts");
const MIGRATION = () => read("supabase/migrations/0011_lead_notification_retry_claim.sql");
const BUTTON = () => read("src/components/admin/leads/RetryNotifyButton.tsx");
const TABLE = () => read("src/components/admin/leads/LeadTable.tsx");
const PAGE = () => read("src/app/admin/leads/page.tsx");
const NOTIFY_LIB = () => read("src/lib/notifications.ts");
const RETRY_LIB = () => read("src/lib/lead-notify-retry.ts");

/* Actores de fixture (inventados). */
const AG_A = "11111111-1111-4111-8111-111111111111";
const AG_B = "22222222-2222-4222-8222-222222222222";
const actor = (over: Partial<RetryActorView>): RetryActorView => ({
  isSuperAdmin: false,
  userId: "user-1",
  memberships: [],
  ...over,
});

/* ============================================================
 * Autorización (1–7)
 * ============================================================ */
test.describe("autorización — canActorRetryLead", () => {
  test("1. owner puede reintentar un lead de su agencia", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_A, role: "owner" }] }), AG_A),
    ).toBe(true);
  });

  test("2. admin puede reintentar un lead de su agencia", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_A, role: "admin" }] }), AG_A),
    ).toBe(true);
  });

  test("3. super-admin puede reintentar, incluso leads sin agencia", () => {
    expect(canActorRetryLead(actor({ isSuperAdmin: true, userId: null }), AG_A)).toBe(true);
    expect(canActorRetryLead(actor({ isSuperAdmin: true, userId: null }), null)).toBe(true);
  });

  test("4. viewer NO puede, ni siquiera en su propia agencia", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_A, role: "viewer" }] }), AG_A),
    ).toBe(false);
  });

  test("4b. agent NO puede: el modelo vigente no le otorga este permiso", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_A, role: "agent" }] }), AG_A),
    ).toBe(false);
  });

  test("5. owner de OTRA agencia no puede", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_B, role: "owner" }] }), AG_A),
    ).toBe(false);
  });

  test("6. sesión ausente no puede", () => {
    expect(canActorRetryLead(actor({ userId: null }), AG_A)).toBe(false);
    const action = codeOf(ACTION());
    // La acción corta ANTES de leer el lead si no hay sesión.
    expect(action).toContain('if (!ctx.isSuperAdmin && !ctx.userId) return { result: "forbidden" }');
  });

  test("6b. lead sin agencia: solo super-admin", () => {
    expect(
      canActorRetryLead(actor({ memberships: [{ agencyId: AG_A, role: "owner" }] }), null),
    ).toBe(false);
  });

  test("7. lead inexistente o de otra agencia => not-found indistinguible, sin eco del id", () => {
    const action = codeOf(ACTION());
    // El scope de agencia va en la CONSULTA para no super-admin.
    expect(action).toContain("agencyId: ctx.scopedAgencyId ?? undefined");
    expect(action).toContain('if (!lead) return { result: "not-found" }');
    // Un id malformado devuelve el mismo código, sin devolverlo al cliente.
    expect(action).toContain('if (!leadId) return { result: "not-found" }');
    const returns = action.match(/return \{ result: [^}]+\}/g) ?? [];
    for (const r of returns) expect(r).not.toContain("leadId");
  });

  test("la autorización de la acción usa la agencia DEL LEAD, no la del cliente", () => {
    const action = codeOf(ACTION());
    expect(action).toContain("canActorRetryLead(");
    expect(action).toContain("lead.agencyId ?? null");
    // El cliente sólo envía leadId: la firma acepta un único argumento.
    expect(action).toContain("retryLeadNotificationAction(\n  leadIdRaw: unknown,\n)");
    for (const banned of ["agencyIdRaw", "emailRaw", "statusRaw", "attemptsRaw"]) {
      expect(action).not.toContain(banned);
    }
  });
});

/* ============================================================
 * Elegibilidad (8–13)
 * ============================================================ */
test.describe("elegibilidad", () => {
  test("8. failed es elegible", () => {
    expect(isRetryEligibleStatus("failed")).toBe(true);
  });

  test("9. skipped es elegible", () => {
    expect(isRetryEligibleStatus("skipped")).toBe(true);
  });

  test("10. unknown es rechazado (histórico no es cola) — en JS y en el SQL", () => {
    expect(isRetryEligibleStatus("unknown")).toBe(false);
    const sql = sqlOf(MIGRATION());
    expect(sql).not.toContain("'unknown'");
  });

  test("11. pending es rechazado (procesamiento en curso)", () => {
    expect(isRetryEligibleStatus("pending")).toBe(false);
    const action = codeOf(ACTION());
    expect(action).toContain('return { result: "already-processing" }');
  });

  test("11b. pending HUÉRFANO (claim >15 min) es recuperable — no quedan leads bloqueados", () => {
    const past = new Date(Date.now() - RETRY_CLAIM_STALE_MS - 60_000).toISOString();
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(isStalePendingClaim(past)).toBe(true);
    expect(isStalePendingClaim(recent)).toBe(false);
    expect(isStalePendingClaim(undefined)).toBe(false);
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("interval '15 minutes'");
  });

  test("12. sent es rechazado: el proveedor ya aceptó el correo", () => {
    expect(isRetryEligibleStatus("sent")).toBe(false);
    const sql = sqlOf(MIGRATION());
    expect(sql).not.toContain("'sent'");
  });

  test("13. la lista de elegibles es exactamente failed+skipped; un valor raro no entra", () => {
    expect([...RETRY_ELIGIBLE_STATUSES].sort()).toEqual(["failed", "skipped"]);
    for (const s of LEAD_NOTIFY_STATUSES) {
      expect(isRetryEligibleStatus(s)).toBe(s === "failed" || s === "skipped");
    }
  });
});

/* ============================================================
 * Claim atómico y concurrencia (14–18)
 * ============================================================ */
test.describe("claim atómico (migración 0011)", () => {
  test("14. el claim es UNA sentencia UPDATE condicional, no select+check+update en JS", () => {
    const sql = sqlOf(MIGRATION());
    const updates = sql.match(/update public\.leads/g) ?? [];
    expect(updates.length).toBe(1);
    expect(sql).not.toMatch(/select[\s\S]*notify_status[\s\S]*update/i);
    // El servicio delega en la RPC; no reimplementa el claim en JS.
    const service = codeOf(SERVICE());
    expect(service).toContain('supabase.rpc("claim_lead_notification_retry"');
  });

  test("15. la exclusividad viene de transicionar a pending en el propio claim", () => {
    const sql = sqlOf(MIGRATION());
    const claim = sql.slice(sql.indexOf("update public.leads"), sql.indexOf("returning"));
    expect(claim).toContain("set notify_status   = 'pending'");
    expect(claim).toContain("notify_status in ('failed', 'skipped')");
    // Un pending FRESCO no es reclamable: el perdedor de la carrera obtiene 0
    // filas. Borde inclusivo (PR3-H): 15 minutos O MÁS es recuperable.
    expect(claim).toContain("notify_last_at <= now() - interval '15 minutes'");
  });

  test("15b. perder la carrera devuelve un resultado neutral, no un error técnico", () => {
    const action = codeOf(ACTION());
    const start = action.indexOf("if (!retry.claimed)");
    const end = action.indexOf('"reintento manual ejecutado"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const noClaim = action.slice(start, end);
    expect(noClaim).toContain('return { result: "already-processing" }');
    expect(noClaim).not.toContain("throw");
    expect(RETRY_RESULT_MESSAGES["already-processing"]).toContain("ya está siendo procesado");
  });

  test("16. doble clic: el botón se deshabilita y el submit en vuelo se ignora", () => {
    const btn = codeOf(BUTTON());
    expect(btn).toContain("if (pending) return");
    expect(btn).toContain("disabled={confirmDisabled}");
    expect(btn).toContain("useTransition");
  });

  test("17. attempts incrementa UNA sola vez: el reintento NO llama a begin_", () => {
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).not.toContain("begin_lead_notification_attempt");
    expect(retryFn).not.toContain("beginAttempt(");
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("notify_attempts = notify_attempts + 1");
  });

  test("18. el claim sella notify_last_at y devuelve el intento", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("notify_last_at  = now()");
    expect(sql).toContain("returning notify_attempts");
  });

  test("la RPC nueva respeta el criterio de seguridad de PR1-H", () => {
    const sql = MIGRATION();
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("update public.leads"); // schema-qualified
    // Tipos = tipos REALES de Production (id text, agency_id UUID). Con text
    // el CREATE aborta en Production con 42883 (uuid = text) — pasó el 04-08.
    expect(sql).toContain("p_lead_id   text");
    expect(sql).toContain("p_agency_id uuid");
    expect(sql).toContain("revoke all on function public.claim_lead_notification_retry(text, uuid) from public");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("drop function if exists public.claim_lead_notification_retry"); // rollback documentado
  });

  test("el scope de agencia está DENTRO del claim (defensa en profundidad)", () => {
    const sql = sqlOf(MIGRATION());
    const claim = sql.slice(sql.indexOf("update public.leads"), sql.indexOf("returning"));
    expect(claim).toContain("agency_id is not distinct from p_agency_id");
  });
});

/* ============================================================
 * Idempotencia (19–20)
 * ============================================================ */
test.describe("idempotencia", () => {
  test("19. el reintento reutiliza la MISMA clave estable del evento", () => {
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    // El envío pasa por notifyNewLead, único punto que arma la clave.
    expect(retryFn).toContain("notifyNewLead(lead)");
    const lib = codeOf(NOTIFY_LIB());
    expect(lib).toContain('"Idempotency-Key": leadIdempotencyKey(lead.id)');
  });

  test("20. NO se genera una clave nueva para forzar la aceptación", () => {
    for (const src of [codeOf(SERVICE()), codeOf(ACTION()), codeOf(BUTTON())]) {
      expect(src).not.toContain("Idempotency-Key");
      expect(src).not.toContain("leadIdempotencyKey(");
      expect(src).not.toMatch(/retry-\$\{|\$\{.*Date\.now\(\).*\}.*[Ii]dempotency/);
    }
    // Una sola definición de la clave en todo src/.
    const lib = codeOf(read("src/lib/notify-status.ts"));
    expect(lib).toContain("return `lead-${leadId}`");
  });

  test("la ventana documentada es 24 h y la ambigüedad se detecta contra ella", () => {
    expect(RETRY_IDEMPOTENCY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    const inside = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const outside = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isAmbiguousRetry(inside)).toBe(false);
    expect(isAmbiguousRetry(outside)).toBe(true);
    expect(isAmbiguousRetry(undefined)).toBe(true);
    expect(isAmbiguousRetry("fecha-invalida")).toBe(true);
  });
});

/* ============================================================
 * Resultados y transiciones (21–24)
 * ============================================================ */
test.describe("resultados", () => {
  test("21. sent actualiza el badge: la acción revalida la bandeja y la UI refresca", () => {
    const action = codeOf(ACTION());
    expect(action).toContain('revalidatePath("/admin/leads")');
    const btn = codeOf(BUTTON());
    expect(btn).toContain("router.refresh()");
  });

  test("22/23. failed y skipped quedan reintentables tras el resultado", () => {
    // El finish persiste failed/skipped, y ambos vuelven a ser elegibles.
    expect(isRetryEligibleStatus("failed")).toBe(true);
    expect(isRetryEligibleStatus("skipped")).toBe(true);
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).toContain("finishAttempt(lead.id, status, reason, messageId)");
  });

  test("24. una respuesta tardía no degrada un sent (guarda de 0010 intacta)", () => {
    const sql0010 = read("supabase/migrations/0010_lead_notification_state.sql");
    const finish = sql0010.slice(sql0010.indexOf("finish_lead_notification_attempt"));
    expect(finish).toContain("notify_status <> 'sent'");
    // 0011 no toca finish_: la guarda sigue siendo la única vía de escritura del resultado.
    expect(MIGRATION()).not.toContain("finish_lead_notification_attempt");
  });

  test("el contrato público es cerrado y sin textos libres", () => {
    expect([...RETRY_RESULTS].sort()).toEqual(
      ["already-processing", "failed", "forbidden", "not-eligible", "not-found", "sent", "skipped"].sort(),
    );
    expect(isRetryResult("sent")).toBe(true);
    expect(isRetryResult("ok")).toBe(false);
    for (const r of RETRY_RESULTS) expect(RETRY_RESULT_MESSAGES[r].length).toBeGreaterThan(10);
  });
});

/* ============================================================
 * UI (25–29 + skipped §9)
 * ============================================================ */
test.describe("UI del reintento", () => {
  test("25/26. el botón y el diálogo NO existen para unknown, pending reciente ni sent", () => {
    const btn = codeOf(BUTTON());
    // PR3-H: la puerta es retryActionKind — null para unknown/sent/pending
    // reciente; "recover" sólo para pending huérfano (≥15 min).
    expect(btn).toContain("const kind = retryActionKind(notifyStatus, notifyLastAt)");
    expect(btn).toContain("if (kind === null) return null");
    // El return null está ANTES de cualquier render del diálogo.
    expect(btn.indexOf("return null")).toBeLessThan(btn.indexOf('role="dialog"'));
  });

  test("27. el diálogo existe para failed/skipped con los datos exigidos", () => {
    const btn = BUTTON();
    expect(btn).toContain("{leadName}");
    expect(btn).toContain("formatLastAt(notifyLastAt)");
    expect(btn).toContain("{notifyAttempts}");
    expect(btn).toContain("{explanation}");
    expect(btn).toContain("Cancelar");
    expect(btn).toContain("Reintentar aviso");
  });

  test("28. antigüedad ambigua => advertencia + confirmación REFORZADA (checkbox)", () => {
    const btn = codeOf(BUTTON());
    expect(btn).toContain("RETRY_AMBIGUOUS_WARNING");
    expect(btn).toContain('type="checkbox"');
    // PR3-H: la reforzada aplica si es ambiguo O si es recuperación.
    expect(btn).toContain("const needsAck = isRecovery || ambiguous");
    expect(btn).toContain("needsAck && !acknowledged");
    expect(RETRY_AMBIGUOUS_WARNING).toContain("Podría existir un correo anterior");
  });

  test("29. desktop y móvil renderizan el botón, gateado por canRetry", () => {
    const table = codeOf(TABLE());
    const uses = table.match(/<RetryNotifyButton/g) ?? [];
    expect(uses.length).toBe(2); // celda Aviso (desktop) + card (mobile)
    const gates = table.match(/canRetry && \(/g) ?? [];
    expect(gates.length).toBe(2);
    // La visibilidad se resuelve en la página, desde la sesión.
    const page = codeOf(PAGE());
    expect(page).toContain("ctx.isSuperAdmin ||");
    expect(page).toContain('m.role === "owner" || m.role === "admin"');
    expect(page).toContain("canRetry={canRetry}");
  });

  test("§9. advertencias de skipped: destinatario y servicio de correo", () => {
    expect(skippedRetryWarning("no-recipients")).toContain("no tiene un destinatario configurado");
    expect(skippedRetryWarning("no-api-key")).toContain("servicio de correo no está configurado");
    expect(skippedRetryWarning("provider-5xx")).toBeNull();
    // Advierte pero NO bloquea: el botón de confirmar no depende del reason.
    const btn = codeOf(BUTTON());
    expect(btn).toContain("configWarning");
    expect(btn).not.toContain("configWarning &&  acknowledged");
    expect(btn).toContain("const confirmDisabled = pending || (needsAck && !acknowledged)");
  });

  test("durante la acción: progreso visible y cierre bloqueado", () => {
    const btn = codeOf(BUTTON());
    expect(btn).toContain("Enviando el aviso…");
    const closeFn = btn.slice(btn.indexOf("function close()"), btn.indexOf("function submit()"));
    expect(closeFn).toContain("if (pending) return");
  });
});

/* ============================================================
 * PII y superficies (30–33)
 * ============================================================ */
test.describe("PII y superficies", () => {
  test("30/32. el componente no recibe ni muestra email, teléfono, mensaje ni message_id", () => {
    const btn = BUTTON();
    for (const banned of ["notifyMessageId", "messageId", "lead.email", "lead.phone", "lead.message", "email:", "phone:"]) {
      expect(btn).not.toContain(banned);
    }
    // Las props son sólo presentación del estado del aviso.
    const props = btn.slice(btn.indexOf("interface RetryNotifyButtonProps"), btn.indexOf("function formatLastAt"));
    expect(props).toContain("leadId");
    expect(props).toContain("leadName");
    expect(props).not.toContain("email");
  });

  test("31. auditoría saneada: sólo campos permitidos en los logs de la acción", () => {
    const action = codeOf(ACTION());
    const logs = action.match(/log\.\w+\("admin\/leads"[\s\S]*?\}\);/g) ?? [];
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const l of logs) {
      for (const key of ["name", "email", "phone", "message:", "recipient", "subject", "body", "ip"]) {
        expect(l.toLowerCase()).not.toContain(key);
      }
      expect(l).toContain("leadId");
    }
    // El log del servicio tampoco registra el message_id del reintento.
    const service = codeOf(SERVICE());
    const retryLog = service.slice(service.indexOf('"reintento registrado"'), service.indexOf("return { claimed: true"));
    expect(retryLog).not.toContain("messageId");
  });

  test("31b. la acción jamás devuelve al cliente datos del lead ni del proveedor", () => {
    const action = codeOf(ACTION());
    const returns = action.match(/return \{ result: [^}]+\}/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(6);
    for (const r of returns) {
      expect(r).not.toMatch(/error|stack|message|email|lead\./i);
    }
  });

  test("33. sin diálogos nativos bloqueantes en las superficies nuevas", () => {
    // Se analiza el CÓDIGO (codeOf): los comentarios pueden nombrar las API
    // prohibidas justamente para explicar por qué no se usan.
    for (const src of [codeOf(BUTTON()), codeOf(ACTION()), codeOf(SERVICE())]) {
      expect(src).not.toContain("window.confirm");
      expect(src).not.toContain("alert(");
      expect(src).not.toContain("prompt(");
    }
  });
});

/* ============================================================
 * Scoping y aislamiento (34–35)
 * ============================================================ */
test.describe("scoping y aislamiento", () => {
  test("34. el scoping por agencia sigue intacto: sesión → consulta → claim", () => {
    const action = codeOf(ACTION());
    expect(action).toContain("getAdminContext()");
    expect(action).toContain("getLeadById(");
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).toContain("lead.agencyId ?? null");
    // La página no cambió su resolución de scope.
    const page = codeOf(PAGE());
    expect(page).toContain("ctx.scopedAgencyId ? { agencyId: ctx.scopedAgencyId } : {}");
  });

  test("34b. sin Supabase configurado el reintento se RECHAZA (no hay claim posible)", () => {
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).toContain("if (!isSupabaseConfigured())");
    expect(retryFn).toContain("claimed: false");
  });

  test("35. las reglas puras no importan red, base ni proveedor", () => {
    const lib = codeOf(RETRY_LIB());
    for (const banned of ["resend", "supabase", "fetch(", "process.env"]) {
      expect(lib.toLowerCase()).not.toContain(banned);
    }
    // Y esta suite tampoco: sólo fs + los módulos puros. Los literales se
    // arman por concatenación para no detectarse a sí mismos.
    const self = readFileSync(join(__dirname, "lead-notification-retry.spec.ts"), "utf8");
    expect(self).not.toContain('from "re' + 'send"');
    expect(self).not.toContain("create" + "Client");
  });
});
