"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWhatsappLeadAction, type CreateLeadResult } from "@/app/admin/leads/intake-actions";
import {
  INTAKE_ERROR_MESSAGES,
  INTAKE_SOURCES,
  INTAKE_SOURCE_LABEL,
  DEFAULT_INTAKE_SOURCE,
} from "@/lib/lead-intake";

/**
 * S28 PR-A — "+ Nueva consulta".
 *
 * Registrar primero, enriquecer después: el único campo obligatorio es el
 * teléfono. Nombre, propiedad, ref y nota son opcionales. El formulario se
 * mantiene abierto tras guardar para cargar la siguiente consulta sin volver a
 * abrirlo (caso típico: varias conversaciones seguidas en el celular).
 */

export interface PropertyOption {
  slug: string;
  title: string;
}

interface NewLeadFormProps {
  properties: PropertyOption[];
}

const INPUT =
  "w-full rounded-md border border-[#D8D8D8] bg-white px-3 py-2 text-sm text-[#0A2342] placeholder:text-slate-400 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-[#4A5568]";

function feedbackFor(r: CreateLeadResult): { tone: string; text: string } {
  switch (r.result) {
    case "created":
      return { tone: "text-emerald-700", text: `Consulta registrada (${r.leadId}).` };
    case "invalid":
      return { tone: "text-amber-700", text: INTAKE_ERROR_MESSAGES[r.error] };
    case "forbidden":
      return { tone: "text-red-700", text: "No tenés permiso para cargar consultas en esta agencia." };
    default:
      return { tone: "text-red-700", text: "No se pudo guardar. Probá de nuevo." };
  }
}

export function NewLeadForm({ properties }: NewLeadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<CreateLeadResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFeedback(null);
    startTransition(async () => {
      const r = await createWhatsappLeadAction(fd);
      setFeedback(r);
      if (r.result === "created") {
        formRef.current?.reset();
        formRef.current?.querySelector<HTMLInputElement>('input[name="phone"]')?.focus();
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-[#D8D8D8] bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Nueva consulta</h2>
          <p className="text-xs text-slate-500">
            Registrá en segundos lo que entra por WhatsApp. Solo el teléfono es obligatorio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="new-lead-form"
          className="inline-flex h-9 items-center gap-1 rounded-md bg-[#0A2342] px-3 text-sm font-semibold text-white hover:bg-[#1A3A6B]"
        >
          {open ? "Cerrar" : "+ Nueva consulta"}
        </button>
      </div>

      {open && (
        <form
          id="new-lead-form"
          ref={formRef}
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-3 border-t border-[#D8D8D8] px-4 py-4 md:grid-cols-6"
        >
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="nl-phone">Teléfono *</label>
            <input
              id="nl-phone"
              name="phone"
              required
              minLength={8}
              maxLength={40}
              autoComplete="off"
              inputMode="tel"
              placeholder="+54 9 379 412-3456 (como venga)"
              className={`${INPUT} mt-1`}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="nl-name">Nombre</label>
            <input
              id="nl-name"
              name="name"
              maxLength={100}
              autoComplete="off"
              placeholder="Como aparece en WhatsApp"
              className={`${INPUT} mt-1`}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="nl-source">Origen</label>
            <select id="nl-source" name="source" defaultValue={DEFAULT_INTAKE_SOURCE} className={`${INPUT} mt-1`}>
              {INTAKE_SOURCES.map((s) => (
                <option key={s} value={s}>{INTAKE_SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={LABEL} htmlFor="nl-property">Propiedad consultada</label>
            <select id="nl-property" name="propertySlug" defaultValue="" className={`${INPUT} mt-1`}>
              <option value="">Consulta general / sin propiedad</option>
              {properties.map((p) => (
                <option key={p.slug} value={p.slug}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={LABEL} htmlFor="nl-ref">Referencia de campaña</label>
            <input
              id="nl-ref"
              name="campaignRef"
              maxLength={60}
              autoComplete="off"
              placeholder="Pegá el 'Ref: GV-…' del mensaje"
              className={`${INPUT} mt-1 font-mono uppercase`}
            />
          </div>
          <div className="md:col-span-5">
            <label className={LABEL} htmlFor="nl-note">Consulta / nota breve</label>
            <input
              id="nl-note"
              name="note"
              maxLength={900}
              autoComplete="off"
              placeholder="Qué busca, zona, presupuesto…"
              className={`${INPUT} mt-1`}
            />
          </div>
          <div className="flex items-end md:col-span-1">
            <button
              type="submit"
              disabled={pending}
              className="h-9 w-full rounded-md bg-[#C9A84C] px-3 text-sm font-semibold text-[#0A2342] hover:brightness-95 disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {feedback && (
            <p role="status" className={`md:col-span-6 text-xs ${feedbackFor(feedback).tone}`}>
              {feedbackFor(feedback).text}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
