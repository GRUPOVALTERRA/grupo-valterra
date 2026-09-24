"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStatusAction, type UpdateStatusResult } from "@/app/admin/leads/intake-actions";
import { LEAD_PIPELINE, LEAD_STATUS_LABEL } from "@/lib/lead-intake";
import type { LeadStatus } from "@/services/mock-leads";

/**
 * S28 PR-A — cambio de estado en la fila, sin abrir la ficha.
 * Un <select> nativo: funciona en el celular, no necesita librería y el
 * servidor revalida el valor contra el CHECK real.
 */
interface Props {
  leadId: string;
  status: LeadStatus;
}

const TONE: Record<LeadStatus, string> = {
  new: "border-blue-300 bg-blue-50 text-blue-800",
  contacted: "border-amber-300 bg-amber-50 text-amber-800",
  qualified: "border-violet-300 bg-violet-50 text-violet-800",
  scheduled: "border-sky-300 bg-sky-50 text-sky-800",
  converted: "border-emerald-300 bg-emerald-50 text-emerald-800",
  lost: "border-slate-300 bg-slate-100 text-slate-600",
  archived: "border-slate-200 bg-slate-50 text-slate-400",
};

const ERROR_TEXT: Partial<Record<UpdateStatusResult, string>> = {
  forbidden: "Sin permiso",
  "not-found": "No encontrada",
  invalid: "Estado inválido",
  error: "Error, reintentá",
};

export function LeadStatusSelect({ leadId, status }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState<LeadStatus>(status);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: LeadStatus) {
    const prev = current;
    setCurrent(next);
    setErr(null);
    startTransition(async () => {
      const { result } = await updateLeadStatusAction(leadId, next);
      if (result === "updated") {
        router.refresh();
      } else {
        setCurrent(prev);
        setErr(ERROR_TEXT[result] ?? "Error");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        aria-label="Estado de la consulta"
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as LeadStatus)}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-60 ${TONE[current]}`}
      >
        {LEAD_PIPELINE.map((s) => (
          <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>
        ))}
      </select>
      {err && <span className="text-[10px] text-red-700">{err}</span>}
    </div>
  );
}
