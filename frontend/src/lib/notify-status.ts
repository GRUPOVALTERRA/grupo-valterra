/**
 * S16-LEAD-OBS — categorización saneada del resultado de notificación.
 *
 * Helper PURO: sin red, sin base, sin proceso. Traduce la forma estructurada
 * del error del proveedor a una categoría de una allowlist cerrada.
 *
 * Por qué una allowlist: el mensaje crudo del proveedor puede contener el
 * correo del destinatario ("550 mailbox unavailable for juan@x.com"). Si se
 * persistiera, la base terminaría acumulando PII por la puerta de atrás. La
 * categoría se guarda; el detalle vive en el log, con retención corta.
 *
 * Se prefiere código estructurado / statusCode sobre el texto: el texto del
 * proveedor cambia sin aviso y no es contrato.
 */

export const NOTIFY_STATUSES = ["unknown", "pending", "sent", "failed", "skipped"] as const;
export type NotifyStatus = (typeof NOTIFY_STATUSES)[number];

export const NOTIFY_REASONS = [
  "legacy-unknown",
  "no-api-key",
  "no-recipients",
  "provider-rejected",
  "provider-timeout",
  "provider-5xx",
  "unknown",
] as const;
export type NotifyReason = (typeof NOTIFY_REASONS)[number];

export function isNotifyReason(value: unknown): value is NotifyReason {
  return typeof value === "string" && (NOTIFY_REASONS as readonly string[]).includes(value);
}

/** Forma mínima y estructurada de un error de proveedor. */
export interface ProviderErrorShape {
  name?: string;
  statusCode?: number;
  /** Solo se usa como ÚLTIMO recurso para detectar timeouts; nunca se persiste. */
  message?: string;
}

const TIMEOUT_HINTS = ["etimedout", "timeout", "timed out", "econnreset", "socket hang up", "abort"];

/**
 * Mapea un error del proveedor a (status, reason).
 * Nunca devuelve el mensaje crudo.
 */
export function classifyProviderError(err: ProviderErrorShape | null | undefined): {
  status: Extract<NotifyStatus, "failed">;
  reason: NotifyReason;
} {
  const code = err?.statusCode;
  const name = (err?.name ?? "").toLowerCase();

  // 1. Preferimos la señal estructurada.
  if (typeof code === "number") {
    // Los códigos de timeout se evalúan ANTES del rango 5xx: 504 es un
    // Gateway Timeout, y clasificarlo como 5xx genérico perdería la
    // distinción entre "el proveedor falló" y "el proveedor no respondió".
    if (code === 408 || code === 504) return { status: "failed", reason: "provider-timeout" };
    if (code >= 500) return { status: "failed", reason: "provider-5xx" };
    if (code >= 400) return { status: "failed", reason: "provider-rejected" };
  }

  // 2. Nombre de error tipado (AbortError, TimeoutError…).
  if (name.includes("timeout") || name.includes("abort")) {
    return { status: "failed", reason: "provider-timeout" };
  }

  // 3. Último recurso: pistas de red en el texto. Se INSPECCIONA, no se guarda.
  const text = (err?.message ?? "").toLowerCase();
  if (text && TIMEOUT_HINTS.some((h) => text.includes(h))) {
    return { status: "failed", reason: "provider-timeout" };
  }

  // 4. Un error con nombre de proveedor pero sin código sigue siendo un rechazo
  //    estructurado; sin ninguna señal, es forma desconocida.
  if (name) return { status: "failed", reason: "provider-rejected" };
  return { status: "failed", reason: "unknown" };
}

/** Clave de idempotencia estable para un lead. Debe ser idéntica entre reintentos. */
export function leadIdempotencyKey(leadId: string): string {
  return `lead-${leadId}`;
}
 