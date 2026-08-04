import type { LeadNotifyStatus } from "@/services/mock-leads";

/**
 * Cómo se ve el estado del aviso en la bandeja — Sprint 16, PR2.
 *
 * Capa de presentación PURA: traduce estado y categoría a lenguaje que el
 * operador entiende. Nada de lo que sale de acá revela información técnica —ni
 * códigos del proveedor, ni identificadores de mensaje, ni destinatarios—:
 * quien mira la bandeja necesita saber si tiene que hacer algo, no depurar un
 * proveedor de correo.
 */

export type NotifyTone = "ok" | "warn" | "error" | "neutral";

export interface NotifyBadge {
  label: string;
  tone: NotifyTone;
  /** Frase que explica el estado. Nunca contiene texto del proveedor. */
  explanation: string;
}

/**
 * Explicaciones por categoría de fallo. La categoría viene de una allowlist
 * cerrada (`notify_reason`), así que este mapa la cubre por completo y no
 * necesita interpretar cadenas libres.
 */
const FAILED_EXPLANATION: Record<string, string> = {
  "provider-timeout": "El proveedor no respondió a tiempo.",
  "provider-5xx": "El proveedor tuvo un error temporal.",
  "provider-rejected": "El proveedor rechazó el envío.",
  unknown: "No se pudo determinar la causa.",
};

const SKIPPED_EXPLANATION: Record<string, string> = {
  "no-api-key": "El servicio de correo no está configurado.",
  "no-recipients": "La agencia no tiene destinatario configurado.",
};

const FALLBACK_FAILED = "No se pudo determinar la causa.";
const FALLBACK_SKIPPED = "Falta configuración para poder enviarlo.";

/**
 * Traduce el estado de un lead a lo que se muestra.
 *
 * Sobre `unknown`: es el estado de los leads anteriores al registro de avisos.
 * Se muestra en tono NEUTRAL, nunca en rojo, y el texto dice lo único que se
 * sabe con certeza —que no hay evidencia—. Pintarlo como error afirmaría que
 * algo falló, y eso no consta; pintarlo como pendiente inventaría una tarea.
 */
export function notifyBadge(
  status: LeadNotifyStatus,
  reason?: string,
): NotifyBadge {
  switch (status) {
    case "sent":
      return {
        label: "Avisado",
        tone: "ok",
        explanation: "El correo fue aceptado por el proveedor.",
      };
    case "pending":
      return {
        label: "Pendiente de aviso",
        tone: "warn",
        explanation:
          "La consulta se registró y el aviso todavía no tiene resultado.",
      };
    case "failed":
      return {
        label: "Falló el aviso",
        tone: "error",
        explanation:
          (reason && FAILED_EXPLANATION[reason]) || FALLBACK_FAILED,
      };
    case "skipped":
      return {
        label: "No enviado",
        tone: "warn",
        explanation:
          (reason && SKIPPED_EXPLANATION[reason]) || FALLBACK_SKIPPED,
      };
    case "unknown":
    default:
      return {
        label: "Histórico · sin evidencia",
        tone: "neutral",
        explanation:
          "Este lead es anterior al registro de notificaciones. No se sabe con certeza si el correo fue enviado.",
      };
  }
}

/** Clases del badge por tono. `neutral` es gris: informa, no alarma. */
export const NOTIFY_TONE_CLASS: Record<NotifyTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};
