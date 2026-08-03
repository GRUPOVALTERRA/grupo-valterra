import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProviderError,
  isNotifyReason,
  leadIdempotencyKey,
  NOTIFY_REASONS,
  NOTIFY_STATUSES,
} from "../src/lib/notify-status";

/**
 * S16-LEAD-OBS PR1 — observabilidad de notificaciones de leads.
 *
 * Unitarios puros + análisis estático. Sin red, sin Supabase, sin Resend,
 * sin emails, sin leads reales.
 */

const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const migration = () =>
  readFileSync(join(__dirname, "../supabase/migrations/0010_lead_notification_state.sql"), "utf8");

const codeOf = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("--"))
    .join("\n");

test.describe("migracion 0010", () => {
  test("1. los leads historicos quedan en unknown/legacy-unknown, nunca en pending", () => {
    const sql = codeOf(migration());
    const backfill = sql.slice(sql.indexOf("update public.leads"), sql.indexOf("alter column notify_status   set default"));
    expect(backfill).toContain("'unknown'");
    expect(backfill).toContain("'legacy-unknown'");
    expect(backfill).not.toContain("'pending'");
    expect(sql.indexOf("update public.leads")).toBeLessThan(sql.indexOf("set default 'pending'"));
  });

  test("2. los leads nuevos nacen pending con 0 intentos", () => {
    const sql = codeOf(migration());
    expect(sql).toContain("alter column notify_status   set default 'pending'");
    expect(sql).toContain("alter column notify_attempts set default 0");
  });

  test("17. unknown y pending son estados distintos (historico != cola operativa)", () => {
    expect(NOTIFY_STATUSES).toContain("unknown");
    expect(NOTIFY_STATUSES).toContain("pending");
    expect(codeOf(migration())).toContain("check (notify_status in ('unknown','pending','sent','failed','skipped'))");
  });

  test("9. el incremento de intentos es atomico en SQL, no leer-sumar-escribir en JS", () => {
    const sql = codeOf(migration());
    expect(sql).toContain("set notify_attempts = notify_attempts + 1");
    const svc = codeOf(read("services/lead-notifications.ts"));
    expect(svc).toContain("begin_lead_notification_attempt");
    expect(svc).not.toMatch(/notify_attempts\s*[:=]\s*\w+\s*\+\s*1/);
  });

  test("10. un lead sent nunca se degrada (guard en ambas funciones SQL)", () => {
    const occurrences = codeOf(migration()).match(/notify_status <> 'sent'/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  test("la migracion no crea indices especulativos", () => {
    expect(codeOf(migration())).not.toContain("create index");
  });

  test("la migracion es idempotente y documenta rollback", () => {
    const sql = migration();
    expect(sql).toContain("add column if not exists");
    expect(sql).toContain("create or replace function");
    expect(sql).toContain("pg_constraint where conname");
    expect(sql).toContain("drop column if exists notify_status");
  });
});

test.describe("categorizacion de errores", () => {
  test("7/11. mapea por senal estructurada a la allowlist", () => {
    expect(classifyProviderError({ statusCode: 503 })).toEqual({ status: "failed", reason: "provider-5xx" });
    expect(classifyProviderError({ statusCode: 504 })).toEqual({ status: "failed", reason: "provider-timeout" });
    expect(classifyProviderError({ statusCode: 422 })).toEqual({ status: "failed", reason: "provider-rejected" });
    expect(classifyProviderError({ name: "AbortError" })).toEqual({ status: "failed", reason: "provider-timeout" });
    expect(classifyProviderError({ message: "socket hang up" })).toEqual({ status: "failed", reason: "provider-timeout" });
    expect(classifyProviderError({})).toEqual({ status: "failed", reason: "unknown" });
    expect(classifyProviderError(null)).toEqual({ status: "failed", reason: "unknown" });
  });

  test("11. toda categoria emitida pertenece a la allowlist", () => {
    const cases = [
      { statusCode: 500 }, { statusCode: 408 }, { statusCode: 400 }, { statusCode: 429 },
      { name: "TimeoutError" }, { name: "ResendError" }, { message: "ETIMEDOUT" }, {}, null,
    ];
    for (const c of cases) expect(isNotifyReason(classifyProviderError(c).reason)).toBe(true);
  });

  test("12. el mensaje crudo del proveedor NUNCA se convierte en reason", () => {
    const crudo = "550 mailbox unavailable for juan.perez@gmail.com - retry later";
    const { reason } = classifyProviderError({ statusCode: 550, message: crudo });
    expect(reason).not.toContain("@");
    expect(reason).not.toContain("mailbox");
    expect(NOTIFY_REASONS).toContain(reason);
  });

  test("12b. la base tambien rechaza un reason fuera de la allowlist", () => {
    const sql = codeOf(migration());
    expect(sql).toContain("leads_notify_reason_check");
    for (const r of NOTIFY_REASONS) expect(sql).toContain(`'${r}'`);
  });
});

test.describe("idempotencia", () => {
  test("15. la clave es estable y depende solo del lead", () => {
    expect(leadIdempotencyKey("LEAD-20260802-ABC123")).toBe("lead-LEAD-20260802-ABC123");
    expect(leadIdempotencyKey("X")).toBe(leadIdempotencyKey("X"));
    expect(leadIdempotencyKey("A")).not.toBe(leadIdempotencyKey("B"));
  });

  test("15b. el envio usa la clave compartida, no una literal duplicada", () => {
    const src = codeOf(read("lib/notifications.ts"));
    expect(src).toContain("leadIdempotencyKey(lead.id)");
    expect(src).not.toContain("`lead-${lead.id}`");
  });

  test("la ventana temporal de la proteccion del proveedor esta documentada", () => {
    expect(read("services/lead-notifications.ts")).toContain("VENTANA");
  });
});

test.describe("ejecucion del envio", () => {
  const route = () => codeOf(read("app/api/contact/route.ts"));

  test("3. after() se agenda exactamente una vez", () => {
    expect((route().match(/\bafter\(/g) ?? []).length).toBe(1);
  });

  test("16. no coexiste el fire-and-forget anterior", () => {
    const src = route();
    expect(src).not.toContain("notifyNewLead(lead).catch");
    expect(src).not.toContain('from "@/lib/notifications"');
    expect((src.match(/processLeadNotification\(/g) ?? []).length).toBe(1);
  });

  test("4. after() se agenda DESPUES de que addLead resolvio, dentro del try", () => {
    const src = route();
    const iAdd = src.indexOf("await addLead(");
    const iAfter = src.indexOf("after(");
    const iCatch = src.indexOf("} catch (err) {", iAdd);
    expect(iAdd).toBeGreaterThan(-1);
    expect(iAfter).toBeGreaterThan(iAdd);
    expect(iAfter).toBeLessThan(iCatch);
  });

  test("5. la API sigue respondiendo 201 con leadId aunque la notificacion falle", () => {
    const src = route();
    expect(src).toContain("{ ok: true, leadId: lead.id }, { status: 201 }");
    const iAfter = src.indexOf("after(");
    expect(src.indexOf("status: 201", iAfter)).toBeGreaterThan(iAfter);
    const beforeAfter = src.slice(0, iAfter);
    expect(beforeAfter).not.toContain("processLeadNotification(");
    expect(src).not.toContain("await after(");
  });

  test("18. sigue funcionando con email deshabilitado (sin API key)", () => {
    expect(codeOf(read("lib/notifications.ts"))).toContain('skipped: "no-api-key"');
    const svc = codeOf(read("services/lead-notifications.ts"));
    expect(svc).toContain('reason = "no-api-key"');
    expect(svc).toContain('status = "skipped"');
  });
});

test.describe("transiciones de estado", () => {
  const svc = () => codeOf(read("services/lead-notifications.ts"));

  test("6/7/8. el resultado se mapea a sent / failed / skipped", () => {
    const s = svc();
    expect(s).toContain('status = "sent"');
    expect(s).toContain('status = "skipped"');
    expect(s).toContain("classifyProviderError(result.providerError)");
    expect(s).toContain("messageId = result.id ?? null");
  });

  test("6b. el message_id se persiste solo en el exito", () => {
    const s = svc();
    const iSent = s.indexOf('status = "sent"');
    expect(s.indexOf("messageId = result.id", iSent)).toBeGreaterThan(iSent);
  });

  test("10b. el servicio no reenvia un lead ya notificado", () => {
    const s = svc();
    expect(s).toContain("alreadySent");
    const iGuard = s.indexOf("if (attempt === null)");
    expect(iGuard).toBeGreaterThan(-1);
    const guardBlock = s.slice(iGuard, s.indexOf("const result", iGuard));
    expect(guardBlock).toContain("return");
    expect(guardBlock).toContain("alreadySent: true");
  });

  test("un fallo al persistir el resultado no lanza: queda en log saneado", () => {
    const s = svc();
    expect(s).toContain('log.error("lead_notifications", "finish attempt error"');
    expect(s).not.toContain("throw ");
  });
});

test.describe("PII", () => {
  const FORBIDDEN = ["lead.email", "lead.phone", "lead.message", "recipients", "subject", "html", "renderHtml"];

  test("13. el objeto persistido no contiene PII", () => {
    const s = codeOf(read("services/lead-notifications.ts"));
    const finish = s.slice(s.indexOf("finish_lead_notification_attempt"), s.indexOf("processLeadNotification"));
    for (const f of FORBIDDEN) expect(finish).not.toContain(f);
    expect(finish).toContain("p_status");
    expect(finish).toContain("p_reason");
  });

  test("14. los logs no incluyen email, telefono, mensaje ni destinatario", () => {
    const s = codeOf(read("services/lead-notifications.ts"));
    const logs = [...s.matchAll(/log\.(info|warn|error)\([\s\S]*?\}\);/g)].map((m) => m[0]).join("\n");
    for (const f of FORBIDDEN) expect(logs).not.toContain(f);
    expect(logs).toContain("leadId");
    expect(logs).toContain("status");
  });

  test("14b. el log del proveedor registra codigo, no el texto crudo ni el destinatario", () => {
    const s = codeOf(read("lib/notifications.ts"));
    const errLog = s.slice(s.indexOf('log.error("notifications", "Resend error"'), s.indexOf("return { ok: false, error: error.message"));
    expect(errLog).toContain("providerStatusCode");
    expect(errLog).not.toContain("message: error.message");
    expect(errLog).not.toContain("to:");
  });

  test("13b. las columnas nuevas no guardan datos de contacto", () => {
    const sql = codeOf(migration());
    const cols = sql.slice(sql.indexOf("add column if not exists"), sql.indexOf("update public.leads"));
    for (const f of ["email", "phone", "recipient", "subject", "body", "ip"]) expect(cols).not.toContain(f);
  });
});
