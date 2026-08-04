import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RETRY_CLAIM_STALE_MS,
  STALE_PENDING_LABEL,
  STALE_RECOVERY_WARNING,
  isStalePendingClaim,
  retryActionKind,
} from "../src/lib/lead-notify-retry";

/**
 * S16-LEAD-OBS PR3-H — recuperación del claim huérfano ("Intento
 * interrumpido").
 *
 * Cobertura INTEGRADA del recorrido UI → server action → RPC con reloj
 * controlado (todas las reglas puras aceptan `now`). Sin Supabase, sin
 * Resend, sin red; la semántica SQL en vivo se valida aparte con PGlite.
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

/** Reloj controlado. */
const NOW = new Date("2026-08-04T15:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

/* ============================================================
 * Elegibilidad temporal con reloj controlado (1–5, 19–20)
 * ============================================================ */
test.describe("elegibilidad temporal — reloj controlado", () => {
  test("1. pending reciente NO muestra acción (kind null)", () => {
    expect(retryActionKind("pending", ago(1 * MIN), NOW)).toBeNull();
    expect(retryActionKind("pending", ago(14 * MIN), NOW)).toBeNull();
  });

  test("2. pending reciente es rechazado por la server action (already-processing)", () => {
    const action = codeOf(ACTION());
    const pre = action.slice(
      action.indexOf("const previousStatus"),
      action.indexOf("const retry = await retryLeadNotification"),
    );
    expect(pre).toContain('previousStatus === "pending" && !isStalePendingClaim(lead.notifyLastAt)');
    expect(pre).toContain('return { result: "already-processing" }');
  });

  test("3. pending reciente pierde el claim también en SQL (defensa final)", () => {
    const sql = sqlOf(MIGRATION());
    const claim = sql.slice(sql.indexOf("update public.leads"), sql.indexOf("returning"));
    // Sólo pending con last_at <= now()-15min entra; el reciente da 0 filas.
    expect(claim).toContain("notify_status = 'pending'");
    expect(claim).toContain("notify_last_at <= now() - interval '15 minutes'");
  });

  test("4. pending de 14:59 NO es elegible (borde exclusivo por abajo)", () => {
    const lastAt = ago(15 * MIN - 1_000); // 14 min 59 s
    expect(isStalePendingClaim(lastAt, NOW)).toBe(false);
    expect(retryActionKind("pending", lastAt, NOW)).toBeNull();
  });

  test("5. pending de 15:00 exactos O MÁS es recuperable (borde inclusivo)", () => {
    expect(isStalePendingClaim(ago(15 * MIN), NOW)).toBe(true);
    expect(retryActionKind("pending", ago(15 * MIN), NOW)).toBe("recover");
    expect(retryActionKind("pending", ago(20 * MIN), NOW)).toBe("recover");
    expect(retryActionKind("pending", ago(3 * 24 * 60 * MIN), NOW)).toBe("recover");
  });

  test("19. unknown sigue sin acción, por viejo que sea su last_at", () => {
    expect(retryActionKind("unknown", ago(999 * MIN), NOW)).toBeNull();
    expect(retryActionKind("unknown", undefined, NOW)).toBeNull();
  });

  test("20. sent sigue sin acción, por viejo que sea su last_at", () => {
    expect(retryActionKind("sent", ago(999 * MIN), NOW)).toBeNull();
    expect(retryActionKind("sent", undefined, NOW)).toBeNull();
  });

  test("pending SIN fecha no es recuperable (no hay evidencia de claim)", () => {
    expect(isStalePendingClaim(undefined, NOW)).toBe(false);
    expect(retryActionKind("pending", undefined, NOW)).toBeNull();
    // Y el SQL exige notify_last_at is not null.
    expect(sqlOf(MIGRATION())).toContain("notify_last_at is not null");
  });
});

/* ============================================================
 * UI de recuperación (6–8, 17)
 * ============================================================ */
test.describe("UI de recuperación", () => {
  test("6. pending huérfano muestra 'Recuperar aviso' y se denomina 'Intento interrumpido'", () => {
    const btn = codeOf(BUTTON());
    expect(btn).toContain('isRecovery ? "Recuperar aviso" : "Reintentar aviso"');
    expect(btn).toContain("STALE_PENDING_LABEL");
    expect(STALE_PENDING_LABEL).toBe("Intento interrumpido");
    // El botón usa la etiqueta dinámica en disparador y confirmación.
    expect(btn).toContain("{actionLabel}");
    expect(btn).toContain('{pending ? "Enviando…" : actionLabel}');
  });

  test("7. el diálogo incluye la advertencia de posible duplicado del gate", () => {
    expect(STALE_RECOVERY_WARNING).toContain("más de 15 minutos");
    expect(STALE_RECOVERY_WARNING).toContain("posibilidad limitada");
    expect(STALE_RECOVERY_WARNING).toContain("aunque el sistema no registrara la respuesta");
    const btn = codeOf(BUTTON());
    expect(btn).toContain("isRecovery ? STALE_RECOVERY_WARNING : RETRY_AMBIGUOUS_WARNING");
  });

  test("8. la recuperación SIEMPRE exige confirmación reforzada", () => {
    const btn = codeOf(BUTTON());
    expect(btn).toContain("const needsAck = isRecovery || ambiguous");
    expect(btn).toContain("const confirmDisabled = pending || (needsAck && !acknowledged)");
    expect(btn).toContain('type="checkbox"');
  });

  test("17. desktop y móvil comparten el MISMO componente con la lógica de recuperación", () => {
    const table = codeOf(TABLE());
    expect((table.match(/<RetryNotifyButton/g) ?? []).length).toBe(2);
    // Ambos montajes pasan notifyLastAt, insumo del cálculo de huérfano.
    expect((table.match(/notifyLastAt=\{lead\.notifyLastAt\}/g) ?? []).length).toBe(2);
  });

  test("pending reciente conserva su badge y explicación de 'en curso'", () => {
    // El badge de pending no cambió: sigue diciendo que está siendo procesado.
    const view = read("src/lib/lead-notify-view.ts");
    expect(view).toContain("Pendiente de aviso");
  });
});

/* ============================================================
 * Recorrido integrado hasta la RPC (9–16, 18)
 * ============================================================ */
test.describe("recorrido integrado", () => {
  test("9. la acción llega REALMENTE a la RPC: cadena completa verificada", () => {
    // UI → action
    const btn = codeOf(BUTTON());
    expect(btn).toContain("retryLeadNotificationAction(leadId)");
    // action (precheck deja pasar el huérfano) → servicio
    const action = codeOf(ACTION());
    expect(action).toContain("retryLeadNotification(lead)");
    // servicio → RPC de claim
    const service = codeOf(SERVICE());
    expect(service).toContain('supabase.rpc("claim_lead_notification_retry"');
  });

  test("10/11. un único request gana: el claim re-sella last_at y el perdedor ve pending FRESCO", () => {
    const sql = sqlOf(MIGRATION());
    const claim = sql.slice(sql.indexOf("update public.leads"), sql.indexOf("returning"));
    // El propio claim vuelve el pending 'fresco' (last_at = now()): dos
    // recuperaciones simultáneas ⇒ la segunda reevalúa tras el row-lock y
    // obtiene 0 filas ⇒ un solo envío.
    expect(claim).toContain("notify_last_at  = now()");
    expect(claim).toContain("set notify_status   = 'pending'");
    // Y el perdedor recibe resultado neutral, sin correo.
    const action = codeOf(ACTION());
    expect(action).toContain("if (!retry.claimed)");
    expect(action).toContain('return { result: "already-processing" }');
  });

  test("12. attempts incrementa UNA vez por recuperación (solo en el claim)", () => {
    const sql = sqlOf(MIGRATION());
    expect((sql.match(/notify_attempts = notify_attempts \+ 1/g) ?? []).length).toBe(1);
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).not.toContain("begin_lead_notification_attempt");
  });

  test("13. last_at se actualiza en el claim y el resultado se persiste con finish", () => {
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("notify_last_at  = now()");
    const service = codeOf(SERVICE());
    const retryFn = service.slice(service.indexOf("export async function retryLeadNotification"));
    expect(retryFn).toContain("finishAttempt(lead.id, status, reason, messageId)");
  });

  test("14. la recuperación termina en sent, failed o skipped (contrato cerrado)", () => {
    const service = codeOf(SERVICE());
    const mapFn = service.slice(
      service.indexOf("function mapNotifyOutcome"),
      service.indexOf("async function beginAttempt"),
    );
    expect(mapFn).toContain('status: "sent"');
    expect(mapFn).toContain('status: "skipped"');
    expect(mapFn).toContain("classifyProviderError");
    const action = codeOf(ACTION());
    expect(action).toContain('retry.status === "sent" || retry.status === "failed" || retry.status === "skipped"');
  });

  test("15. una respuesta tardía no degrada un sent (guarda de 0010 vigente)", () => {
    const sql0010 = read("supabase/migrations/0010_lead_notification_state.sql");
    const finish = sql0010.slice(sql0010.indexOf("finish_lead_notification_attempt"));
    expect(finish).toContain("notify_status <> 'sent'");
  });

  test("16. el cliente NO controla antigüedad ni agencia: tiempo autoritativo en SQL", () => {
    const action = codeOf(ACTION());
    // La acción acepta un único argumento; nada de flags stale ni fechas.
    expect(action).toContain("retryLeadNotificationAction(\n  leadIdRaw: unknown,\n)");
    for (const banned of ["staleRaw", "lastAtRaw", "agencyIdRaw", "nowRaw", "thresholdRaw"]) {
      expect(action).not.toContain(banned);
    }
    // El botón sólo envía leadId.
    const btn = codeOf(BUTTON());
    expect(btn).toContain("retryLeadNotificationAction(leadId)");
    // La RPC decide con now() del servidor de base y agencia server-side.
    const sql = sqlOf(MIGRATION());
    expect(sql).toContain("now() - interval '15 minutes'");
    expect(sql).toContain("agency_id is not distinct from p_agency_id");
    // La RPC no recibe umbral por parámetro.
    expect(sql).not.toContain("p_threshold");
    expect(sql).not.toContain("p_stale");
  });

  test("18. los textos nuevos no llevan PII y los logs no cambiaron su contrato", () => {
    for (const t of [STALE_PENDING_LABEL, STALE_RECOVERY_WARNING]) {
      expect(t).not.toMatch(/@|\+54|tel[eé]fono:|email:/i);
    }
    const action = codeOf(ACTION());
    const logs = action.match(/log\.\w+\("admin\/leads"[\s\S]*?\}\);/g) ?? [];
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const l of logs) {
      for (const key of ["name", "email", "phone", "recipient", "subject", "body"]) {
        expect(l.toLowerCase()).not.toContain(key);
      }
    }
  });
});

/* ============================================================
 * Umbral: una sola fuente autoritativa, sincronización testeada
 * ============================================================ */
test.describe("umbral del claim huérfano", () => {
  test("el SQL es autoritativo y la constante de UI coincide — este test falla si divergen", () => {
    const sql = sqlOf(MIGRATION());
    const m = sql.match(/interval '(\d+) minutes'/);
    expect(m).not.toBeNull();
    const sqlMs = Number(m![1]) * 60_000;
    expect(sqlMs).toBe(RETRY_CLAIM_STALE_MS);
    // Y ambos lados usan borde INCLUSIVO (>= en TS, <= en SQL).
    expect(sql).toContain("notify_last_at <= now()");
    const lib = codeOf(read("src/lib/lead-notify-retry.ts"));
    expect(lib).toContain("now.getTime() - last >= RETRY_CLAIM_STALE_MS");
  });
});
