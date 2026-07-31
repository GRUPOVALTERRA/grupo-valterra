"use client";

import { useEffect, useRef } from "react";

/**
 * Diálogo de confirmación de la aplicación — Sprint 15-B.
 *
 * Reemplaza a `window.confirm`, que bloquea el hilo del renderer: mientras el
 * diálogo nativo está abierto la página deja de responder por completo (no
 * repinta, no atiende eventos). Además de ser inconsistente con el resto del
 * panel, eso hacía que cualquier automatización sobre las acciones sensibles
 * quedara colgada esperando una respuesta que nunca llegaba.
 *
 * Este modal es HTML común: la página sigue viva, el foco queda contenido y
 * Escape cancela.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2342]/50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#D8D8D8] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-base font-bold text-[#0A2342]">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-sm text-slate-600">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold text-white ${
              tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-[#0A2342] hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
