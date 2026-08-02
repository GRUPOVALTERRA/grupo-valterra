"use client";

import { useState, type FormEvent } from "react";
import { updateAgencyAction } from "../actions";

const INPUT =
  "h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none";
const LABEL = "block text-xs font-semibold text-[#0A2342]";

interface Props {
  slug: string;
  initial: {
    name: string;
    contact_email: string;
    contact_phone: string;
    whatsapp: string;
    address: string;
    city: string;
    province: string;
  };
}

/**
 * Configuración de agencia — Sprint 16.
 *
 * Hasta ahora estos datos sólo podían fijarse al crear la agencia; cambiarlos
 * exigía SQL manual (así se corrigió el destinatario de leads en S15). El
 * email de contacto es el destino de los avisos de consultas, por eso el
 * formulario lo marca y lo exige.
 */
export function AgencySettingsForm({ slug, initial }: Props) {
  const [pending, setPending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setOk(false);
    setError(null);
    setErrors({});
    const fd = new FormData(e.currentTarget);
    fd.set("slug", slug);
    const res = await updateAgencyAction(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo guardar");
      setErrors(res.errors ?? {});
      return;
    }
    setOk(true);
  };

  const err = (k: string) =>
    errors[k] ? <p className="mt-1 text-[11px] text-red-600">{errors[k]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-[#D8D8D8] bg-white p-4">
      <div>
        <label className={LABEL} htmlFor="ag-name">Nombre</label>
        <input id="ag-name" name="name" defaultValue={initial.name} className={`${INPUT} mt-1`} />
        {err("name")}
      </div>

      <div>
        <label className={LABEL} htmlFor="ag-email">
          Email de contacto * <span className="font-normal text-slate-500">(recibe los avisos de consultas)</span>
        </label>
        <input id="ag-email" name="contact_email" type="email" required
          defaultValue={initial.contact_email} className={`${INPUT} mt-1`} />
        {err("contact_email")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="ag-phone">Teléfono</label>
          <input id="ag-phone" name="contact_phone" defaultValue={initial.contact_phone} className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ag-wa">WhatsApp</label>
          <input id="ag-wa" name="whatsapp" defaultValue={initial.whatsapp} className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ag-city">Ciudad</label>
          <input id="ag-city" name="city" defaultValue={initial.city} className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ag-prov">Provincia</label>
          <input id="ag-prov" name="province" defaultValue={initial.province} className={`${INPUT} mt-1`} />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="ag-addr">Dirección</label>
        <input id="ag-addr" name="address" defaultValue={initial.address} className={`${INPUT} mt-1`} />
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Cambios guardados
        </div>
      )}

      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-md bg-[#0A2342] px-4 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
