import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { notifyNewLead } from "@/lib/notifications";
import { classifyProviderError, type NotifyReason, type NotifyStatus } from "@/lib/notify-status";
import type { Lead } from "@/services/mock-leads";

/**
 * S16-LEAD-OBS — orquestación y persistencia del estado de notificación.
 *
 * Separación de responsabilidades:
 *   - `notifyNewLead` (lib/notifications): resuelve destinatario, arma el
 *     correo, llama al proveedor y devuelve un NotifyResult. NO escribe.
 *   - `processLeadNotification` (acá): registra el intento, invoca el envío,
 *     mapea el resultado y lo persiste.
 *
 * Atomicidad: el contador de intentos NO se lee-suma-escribe desde JS (eso
 * genera carreras entre ejecuciones concurrentes). Se delega en la función
 * SQL `begin_lead_notification_attempt`, que incrementa y sella la fecha en
 * una sola sentencia, y que además NO aplica sobre un lead ya `sent`.
 *
 * Idempotencia: `notifyNewLead` usa una clave estable por lead. El proveedor
 * deduplica reintentos con la misma clave, pero esa protección tiene VENTANA
 * TEMPORAL: no es una garantía permanente contra duplicados. Por eso PR1 no
 * implementa reintento, y un futuro reintento manual (PR3) deberá advertir
 * cuando el intento ambiguo tenga más de 24 h.
 */

export interface ProcessResult {
  ok: boolean;
  status: NotifyStatus;
  reason: NotifyReason | null;
  attempt: number | null;
  /** true si no se intentó porque el lead ya estaba `sent`. */
  alreadySent?: boolean;
}

/** Registra el inicio del intento. Devuelve el número de intento, o null si no aplica. */
async function beginAttempt(leadId: string): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await withTimeout(
    supabase.rpc("begin_lead_notification_attempt", { p_lead_id: leadId }),
    4000,
    "leads.beginNotifyAttempt",
  );
  if (error) {
    log.error("lead_notifications", "begin attempt error", { leadId, code: error.code });
    return null;
  }
  return typeof data === "number" ? data : null;
}

/** Persiste el resultado. Nunca degrada un lead ya `sent` (lo garantiza el WHERE de la función). */
async function finishAttempt(
  leadId: string,
  status: NotifyStatus,
  reason: NotifyReason | null,
  messageId: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await withTimeout(
    supabase.rpc("finish_lead_notification_attempt", {
      p_lead_id: leadId,
      p_status: status,
      p_reason: reason,
      p_message_id: messageId,
    }),
    4000,
    "leads.finishNotifyAttempt",
  );
  if (error) {
    // El correo pudo haberse enviado igual: no perdemos el lead, pero el
    // estado queda desactualizado. Se registra saneado para diagnóstico.
    log.error("lead_notifications", "finish attempt error", { leadId, status, reason, code: error.code });
  }
}

/**
 * Ejecuta y registra la notificación de un lead ya persistido.
 * NUNCA lanza: cualquier fallo se traduce a estado + log saneado.
 */
export async function processLeadNotification(lead: Lead): Promise<ProcessResult> {
  if (!isSupabaseConfigured()) {
    // Sin base no hay estado que registrar; el envío igual se intenta para no
    // cambiar el comportamiento en entornos de desarrollo.
    const res = await notifyNewLead(lead);
    return { ok: res.ok, status: res.ok ? "sent" : "failed", reason: null, attempt: null };
  }

  const attempt = await beginAttempt(lead.id);
  if (attempt === null) {
    // La función no aplicó: el lead ya está `sent` (o no existe). No se
    // reenvía nada: un lead notificado no se vuelve a notificar solo.
    log.info("lead_notifications", "intento omitido (lead ya notificado o inexistente)", { leadId: lead.id });
    return { ok: true, status: "sent", reason: null, attempt: null, alreadySent: true };
  }

  const result = await notifyNewLead(lead);

  let status: NotifyStatus;
  let reason: NotifyReason | null = null;
  let messageId: string | null = null;

  if (result.ok) {
    status = "sent";
    messageId = result.id ?? null;
  } else if (result.skipped === "no-api-key") {
    status = "skipped";
    reason = "no-api-key";
  } else if (result.skipped === "no-recipients") {
    status = "skipped";
    reason = "no-recipients";
  } else {
    const mapped = classifyProviderError(result.providerError);
    status = mapped.status;
    reason = mapped.reason;
  }

  await finishAttempt(lead.id, status, reason, messageId);

  // Log saneado: sin email, teléfono, mensaje, destinatario, asunto ni cuerpo.
  log.info("lead_notifications", "intento registrado", {
    leadId: lead.id,
    agencyId: lead.agencyId ?? null,
    status,
    reason,
    attempt,
    providerStatusCode: result.providerError?.statusCode ?? null,
  });

  return { ok: status === "sent", status, reason, attempt };
}
