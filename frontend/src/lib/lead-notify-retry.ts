import type { LeadNotifyStatus } from "@/services/mock-leads";

/**
 * S16-LEAD-OBS PR3 — reglas PURAS del reintento manual de aviso.
 *
 * Sin red, sin base, sin proceso: todo lo que decide quién puede reintentar,
 * qué estados son elegibles y qué se le dice al operador vive acá, para que
 * los tests lo ejerciten directamente y la server action solo orqueste.
 *
 * La AUTORIDAD final de elegibilidad y concurrencia es la función SQL
 * `claim_lead_notification_retry` (migración 0011): estas reglas se evalúan
 * antes para dar códigos de resultado precisos, nunca como único control.
 */

/** Estados elegibles para reintento. unknown NO es una cola; sent NUNCA se reenvía. */
export const RETRY_ELIGIBLE_STATUSES = ["failed", "skipped"] as const satisfies readonly LeadNotifyStatus[];

export function isRetryEligibleStatus(status: LeadNotifyStatus): boolean {
  return (RETRY_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Ventana documentada de la deduplicación del proveedor (Idempotency-Key).
 * NO es una garantía permanente: pasada la ventana, la misma clave puede
 * volver a aceptarse y generar un segundo correo.
 */
export const RETRY_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Un claim `pending` más viejo que esto se considera huérfano (el proceso
 * murió sin registrar resultado) y vuelve a ser reclamable. Debe coincidir
 * con el intervalo de la migración 0011.
 */
export const RETRY_CLAIM_STALE_MS = 15 * 60 * 1000;

/**
 * true si el reintento es de antigüedad incierta: no hay fecha de último
 * intento, o quedó fuera de la ventana de idempotencia. En ese caso la UI
 * debe advertir posible duplicado y exigir confirmación reforzada.
 */
export function isAmbiguousRetry(notifyLastAt: string | undefined, now: Date = new Date()): boolean {
  if (!notifyLastAt) return true;
  const last = new Date(notifyLastAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > RETRY_IDEMPOTENCY_WINDOW_MS;
}

/** true si un `pending` puede considerarse claim huérfano recuperable. */
export function isStalePendingClaim(notifyLastAt: string | undefined, now: Date = new Date()): boolean {
  if (!notifyLastAt) return false;
  const last = new Date(notifyLastAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last > RETRY_CLAIM_STALE_MS;
}

/* ------------------------------------------------------------------ */
/* Autorización                                                        */
/* ------------------------------------------------------------------ */

export interface RetryActorView {
  isSuperAdmin: boolean;
  userId: string | null;
  memberships: readonly { agencyId: string; role: string }[];
}

/** Roles de agencia habilitados. El modelo vigente NO otorga este permiso a agent ni viewer. */
export const RETRY_ALLOWED_ROLES = ["owner", "admin"] as const;

/**
 * ¿Puede este actor reintentar el aviso de un lead de la agencia dada?
 * - super-admin: siempre (incluidos leads sin agencia).
 * - owner/admin: solo en SU agencia, y solo si el lead tiene esa agencia.
 * - viewer/agent/otra agencia/sesión ausente: no.
 * El agencyId del lead debe venir RESUELTO POR EL SERVIDOR, jamás del cliente.
 */
export function canActorRetryLead(
  actor: RetryActorView,
  leadAgencyId: string | null | undefined,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (!actor.userId) return false;
  if (!leadAgencyId) return false; // lead sin agencia: solo super-admin
  return actor.memberships.some(
    (m) =>
      m.agencyId === leadAgencyId &&
      (RETRY_ALLOWED_ROLES as readonly string[]).includes(m.role),
  );
}

/* ------------------------------------------------------------------ */
/* Contrato de resultado hacia la UI                                   */
/* ------------------------------------------------------------------ */

/**
 * Resultados públicos de la server action. Cerrado: la UI decide por código,
 * nunca por texto libre. No transportan PII, error del proveedor, message_id
 * ni stack. (`retry-started` del contrato del gate no se emite: la acción es
 * síncrona y siempre devuelve el resultado final.)
 */
export const RETRY_RESULTS = [
  "sent",
  "failed",
  "skipped",
  "not-eligible",
  "already-processing",
  "forbidden",
  "not-found",
] as const;
export type RetryResult = (typeof RETRY_RESULTS)[number];

export function isRetryResult(value: unknown): value is RetryResult {
  return typeof value === "string" && (RETRY_RESULTS as readonly string[]).includes(value);
}

/** Mensajes saneados que la UI muestra por código. Sin destinatario, sin códigos técnicos. */
export const RETRY_RESULT_MESSAGES: Record<RetryResult, string> = {
  sent: "Aviso enviado. El proveedor aceptó el correo.",
  failed: "El envío volvió a fallar. El lead queda disponible para otro reintento.",
  skipped: "El envío se omitió otra vez. Revisá la configuración antes de reintentar.",
  "not-eligible": "Este aviso no admite reintento en su estado actual.",
  "already-processing": "El aviso ya está siendo procesado o el estado cambió.",
  forbidden: "No tenés permisos para reintentar este aviso.",
  "not-found": "No se encontró la consulta.",
};

/**
 * Advertencia previa según el motivo del skip anterior. No bloquea el botón:
 * la configuración pudo corregirse después del intento; sí se advierte.
 */
export function skippedRetryWarning(reason: string | undefined): string | null {
  if (reason === "no-recipients") {
    return "La agencia no tiene un destinatario configurado. Corregí el email de contacto antes de reintentar.";
  }
  if (reason === "no-api-key") {
    return "El servicio de correo no está configurado. El reintento volverá a fallar hasta corregir la configuración.";
  }
  return null;
}

/** Advertencia de posible duplicado para reintentos de antigüedad incierta. */
export const RETRY_AMBIGUOUS_WARNING =
  "El último intento es antiguo o de fecha incierta: la protección contra duplicados del proveedor ya no cubre este reintento. Podría existir un correo anterior aunque el sistema no tenga confirmación.";
