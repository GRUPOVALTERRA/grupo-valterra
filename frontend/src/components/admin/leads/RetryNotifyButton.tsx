"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryLeadNotificationAction } from "@/app/admin/leads/actions";
import { notifyBadge } from "@/lib/lead-notify-view";
import {
  isAmbiguousRetry,
  retryActionKind,
  skippedRetryWarning,
  RETRY_AMBIGUOUS_WARNING,
  RETRY_RESULT_MESSAGES,
  STALE_PENDING_LABEL,
  STALE_RECOVERY_WARNING,
  type RetryResult,
} from "@/lib/lead-notify-retry";
import type { LeadNotifyStatus } from "@/services/mock-leads";

/**
 * S16-LEAD-OBS PR3 — botón "Reintentar aviso" + diálogo de confirmación.
 *
 * Se renderiza SOLO para failed/skipped (y el padre además lo omite si el
 * usuario no está autorizado a nivel visibilidad). La autorización REAL vive
 * en la server action; esto es presentación.
 *
 * Diálogo propio controlado (patrón S15-B): nada de window.confirm/alert/
 * prompt. Muestra nombre, fecha del último intento, cantidad de intentos y la
 * explicación saneada. Cuando el intento es antiguo o de fecha incierta exige
 * confirmación REFORZADA (checkbox) y advierte el posible duplicado.
 *
 * Anti doble-submit: el claim atómico del servidor es la garantía; acá además
 * se deshabilita el botón y se ignera un submit mientras hay uno en vuelo.
 *
 * Nunca se muestran: destinatario, message_id, códigos técnicos del proveedor.
 */

interface RetryNotifyButtonProps {
  leadId: string;
  leadName: string;
  notifyStatus: LeadNotifyStatus;
  notifyReason?: string;
  notifyAttempts: number;
  notifyLastAt?: string;
}

function formatLastAt(iso: string | undefined): string {
  if (!iso) return "sin fecha registrada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin fecha registrada";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const RESULT_TONE: Record<RetryResult, string> = {
  sent: "text-emerald-700",
  failed: "text-red-700",
  skipped: "text-amber-700",
  "not-eligible": "text-slate-600",
  "already-processing": "text-slate-600",
  forbidden: "text-red-700",
  "not-found": "text-slate-600",
};

export function RetryNotifyButton({
  leadId,
  leadName,
  notifyStatus,
  notifyReason,
  notifyAttempts,
  notifyLastAt,
}: RetryNotifyButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<RetryResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Elegibilidad de PRESENTACIÓN (el servidor y el SQL revalidan solos):
  // failed/skipped → "retry"; pending huérfano (≥15 min) → "recover";
  // unknown, sent y pending reciente (en curso) → sin acción.
  const kind = retryActionKind(notifyStatus, notifyLastAt);
  if (kind === null) return null;

  const isRecovery = kind === "recover";
  const actionLabel = isRecovery ? "Recuperar aviso" : "Reintentar aviso";
  const ambiguous = isAmbiguousRetry(notifyLastAt);
  const configWarning = skippedRetryWarning(notifyReason);
  const explanation = isRecovery
    ? `${STALE_PENDING_LABEL}: el proceso no registró el resultado del envío.`
    : notifyBadge(notifyStatus, notifyReason).explanation;
  // La recuperación SIEMPRE exige confirmación reforzada; el reintento sólo
  // cuando la antigüedad es ambigua (>24 h o sin fecha).
  const needsAck = isRecovery || ambiguous;
  const warningText = isRecovery ? STALE_RECOVERY_WARNING : RETRY_AMBIGUOUS_WARNING;
  const confirmDisabled = pending || (needsAck && !acknowledged);

  function close() {
    if (pending) return; // no se cierra con un envío en vuelo
    setOpen(false);
    setAcknowledged(false);
    setResult(null);
  }

  function submit() {
    if (pending) return; // anti doble-clic; la garantía real es el claim SQL
    startTransition(async () => {
      const res = await retryLeadNotificationAction(leadId);
      setResult(res.result);
      // El badge de la fila se refresca con datos del servidor.
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center rounded-md border border-[#D8D8D8] bg-white px-2 text-[11px] font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
      >
        {actionLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retry-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2342]/50 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#D8D8D8] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="retry-title" className="text-base font-bold text-[#0A2342]">
              {isRecovery ? "Recuperar aviso interrumpido" : "Reintentar aviso por correo"}
            </h2>

            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div>
                <dt className="inline font-semibold">Consulta:</dt>{" "}
                <dd className="inline">{leadName}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Último intento:</dt>{" "}
                <dd className="inline">{formatLastAt(notifyLastAt)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Intentos:</dt>{" "}
                <dd className="inline">{notifyAttempts}</dd>
              </div>
            </dl>

            <p className="mt-3 text-sm text-slate-600">{explanation}</p>

            {configWarning && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {configWarning}
              </p>
            )}

            {needsAck && result === null && (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
                <p className="text-sm text-amber-900">{warningText}</p>
                <label className="mt-2 flex items-start gap-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Entiendo que el destinatario podría recibir el aviso dos veces.</span>
                </label>
              </div>
            )}

            {pending && (
              <p className="mt-3 text-sm font-medium text-slate-600" role="status">
                Enviando el aviso…
              </p>
            )}

            {result !== null && !pending && (
              <p className={`mt-3 text-sm font-semibold ${RESULT_TONE[result]}`} role="status">
                {RETRY_RESULT_MESSAGES[result]}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-50"
              >
                {result === null ? "Cancelar" : "Cerrar"}
              </button>
              {result === null && (
                <button
                  type="button"
                  onClick={submit}
                  disabled={confirmDisabled}
                  className="inline-flex h-9 items-center rounded-md bg-[#0A2342] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {pending ? "Enviando…" : actionLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
