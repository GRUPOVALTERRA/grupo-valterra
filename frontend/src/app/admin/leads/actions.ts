"use server";

import { revalidatePath } from "next/cache";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import { getLeadById, type Lead } from "@/services/mock-leads";
import { retryLeadNotification } from "@/services/lead-notifications";
import {
  canActorRetryLead,
  isRetryEligibleStatus,
  isStalePendingClaim,
  type RetryResult,
} from "@/lib/lead-notify-retry";

/**
 * S16-LEAD-OBS PR3 — server action del reintento manual de aviso.
 *
 * Contrato con el cliente: entra SOLO un leadId; sale SOLO un código de
 * `RETRY_RESULTS`. Nunca viajan al cliente: error del proveedor, destinatario,
 * message_id, stack, códigos internos ni datos del lead. El cliente no puede
 * enviar agencyId, email, status ni attempts — todo se resuelve acá, de la
 * sesión y de la base.
 *
 * CSRF/origin: las Server Actions de Next sólo aceptan POST del mismo origen
 * (verificación Origin/Host propia del framework); no se agrega superficie.
 *
 * Autorización: owner/admin de la agencia del lead, o super-admin. El modelo
 * vigente no otorga este permiso a agent ni viewer. Ocultar el botón NO es la
 * autorización: esta acción es la que decide.
 *
 * Concurrencia: la exclusividad la da `claim_lead_notification_retry` (0011)
 * dentro del servicio. Los prechequeos de acá existen para devolver códigos
 * precisos; perder la carrera devuelve `already-processing`, sin error técnico.
 */

const LEAD_ID_MAX = 64;
const LEAD_ID_SHAPE = /^[A-Za-z0-9-]+$/;

export interface RetryLeadNotificationActionResult {
  result: RetryResult;
}

export async function retryLeadNotificationAction(
  leadIdRaw: unknown,
): Promise<RetryLeadNotificationActionResult> {
  // 1. Entrada: un id con forma válida. Inválido == inexistente (sin eco).
  const leadId =
    typeof leadIdRaw === "string" &&
    leadIdRaw.length > 0 &&
    leadIdRaw.length <= LEAD_ID_MAX &&
    LEAD_ID_SHAPE.test(leadIdRaw)
      ? leadIdRaw
      : null;
  if (!leadId) return { result: "not-found" };

  // 2. Sesión y contexto.
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin && !ctx.userId) return { result: "forbidden" };
  if (!ctx.isSuperAdmin && !ctx.scopedAgencyId) return { result: "forbidden" };

  // 3. Lead resuelto server-side, con scope de agencia para no super-admin.
  //    Otra agencia o inexistente => null indistinguible (no filtra información).
  let lead: Lead | null = null;
  try {
    lead = await getLeadById(
      leadId,
      ctx.isSuperAdmin ? {} : { agencyId: ctx.scopedAgencyId ?? undefined },
    );
  } catch {
    // Fallo de lectura: no se revela detalle; no se intentó ningún envío.
    return { result: "already-processing" };
  }
  if (!lead) return { result: "not-found" };

  // 4. Rol contra la agencia DEL LEAD (no contra lo que diga el cliente).
  const authorized = canActorRetryLead(
    { isSuperAdmin: ctx.isSuperAdmin, userId: ctx.userId, memberships: ctx.memberships },
    lead.agencyId ?? null,
  );
  if (!authorized) {
    log.warn("admin/leads", "reintento denegado por rol", {
      leadId: lead.id,
      agencyId: lead.agencyId ?? null,
      actorId: ctx.userId,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    return { result: "forbidden" };
  }

  // 5. Precheck de elegibilidad para códigos precisos. La AUTORIDAD es el
  //    claim SQL: este precheck nunca es el único control.
  const previousStatus = lead.notifyStatus;
  if (!isRetryEligibleStatus(previousStatus)) {
    if (previousStatus === "pending" && !isStalePendingClaim(lead.notifyLastAt)) {
      return { result: "already-processing" };
    }
    if (previousStatus !== "pending") {
      // unknown (histórico, no es cola), sent (jamás se reenvía) o valor raro.
      return { result: "not-eligible" };
    }
    // pending huérfano (>15 min): recuperable, sigue al claim.
  }

  // 6-7. Claim atómico + envío + persistencia (servicio). Misma idempotency key.
  const retry = await retryLeadNotification(lead);

  if (!retry.claimed) {
    // Perdió la carrera o el estado cambió entre lectura y claim. Neutral.
    log.info("admin/leads", "reintento sin claim", {
      leadId: lead.id,
      agencyId: lead.agencyId ?? null,
      actorId: ctx.userId,
      previousStatus,
    });
    return { result: "already-processing" };
  }

  // Auditoría saneada: leadId, agencyId, actor, estado previo, resultado,
  // intento, reason, fecha (la agrega el logger). Sin PII, sin message_id.
  log.info("admin/leads", "reintento manual ejecutado", {
    leadId: lead.id,
    agencyId: lead.agencyId ?? null,
    actorId: ctx.userId,
    previousStatus,
    result: retry.status,
    reason: retry.reason,
    attempt: retry.attempt,
  });

  // 8. La bandeja refleja el badge nuevo.
  revalidatePath("/admin/leads");

  // 9. Resultado público cerrado.
  if (retry.status === "sent" || retry.status === "failed" || retry.status === "skipped") {
    return { result: retry.status };
  }
  return { result: "already-processing" };
}
