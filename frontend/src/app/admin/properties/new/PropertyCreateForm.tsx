"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createPropertyAction } from "../actions";

const INPUT =
  "h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none";
const LABEL = "block text-xs font-semibold text-[#0A2342]";

/**
 * Alta de propiedad — Sprint 15-A.
 *
 * La propiedad se guarda como BORRADOR: publicar es un paso explícito desde el
 * listado. El formulario no envía `agency_id`; la agencia se resuelve en el
 * servidor desde la sesión.
 */
export function PropertyCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setErrors({});

    const res = await createPropertyAction(new FormData(e.currentTarget));
    if (!res.ok) {
      setError(res.error ?? "No se pudo crear la propiedad");
      setErrors(res.errors ?? {});
      setPending(false);
      return;
    }
    router.push(`/admin/properties/${res.slug}/edit`);
    router.refresh();
  };

  const fieldError = (k: string) =>
    errors[k] ? <p className="mt-1 text-[11px] text-red-600">{errors[k]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-[#D8D8D8] bg-white p-5">
      <div>
        <label className={LABEL} htmlFor="title">Titulo *</label>
        <input id="title" name="title" required minLength={4} maxLength={200} className={`${INPUT} mt-1`} />
        <p className="mt-1 text-[11px] text-slate-400">
          La URL publica se genera desde el titulo.
        </p>
        {fieldError("title")}
      </div>

      <div>
        <label className={LABEL} htmlFor="description">Descripcion</label>
        <textarea id="description" name="description" rows={4}
          className="mt-1 w-full rounded-md border border-[#D8D8D8] bg-white p-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none" />
        {fieldError("description")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="operationType">Operacion *</label>
          <select id="operationType" name="operationType" required className={`${INPUT} mt-1`} defaultValue="venta">
            <option value="venta">Venta</option>
            <option value="alquiler">Alquiler</option>
            <option value="alquiler-temporal">Alquiler temporal</option>
          </select>
          {fieldError("operation_type")}
        </div>
        <div>
          <label className={LABEL} htmlFor="propertyType">Tipo *</label>
          <select id="propertyType" name="propertyType" required className={`${INPUT} mt-1`} defaultValue="casa">
            {["casa","departamento","ph","terreno","local","oficina","campo","country"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {fieldError("property_type")}
        </div>
        <div>
          <label className={LABEL} htmlFor="price">Precio *</label>
          <input id="price" name="price" type="number" min={0} step="0.01" required className={`${INPUT} mt-1`} />
          {fieldError("price")}
        </div>
        <div>
          <label className={LABEL} htmlFor="currency">Moneda *</label>
          <select id="currency" name="currency" required className={`${INPUT} mt-1`} defaultValue="USD">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
          {fieldError("currency")}
        </div>
        <div>
          <label className={LABEL} htmlFor="city">Ciudad *</label>
          <input id="city" name="city" required className={`${INPUT} mt-1`} />
          {fieldError("city")}
        </div>
        <div>
          <label className={LABEL} htmlFor="province">Provincia *</label>
          <input id="province" name="province" required className={`${INPUT} mt-1`} />
          {fieldError("province")}
        </div>
        <div>
          <label className={LABEL} htmlFor="neighborhood">Barrio / zona</label>
          <input id="neighborhood" name="neighborhood" className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="address">Direccion</label>
          <input id="address" name="address" className={`${INPUT} mt-1`} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["bedrooms", "Dormitorios"],
          ["bathrooms", "Baños"],
          ["parking", "Cocheras"],
          ["coveredAreaM2", "Cubiertos m2"],
          ["totalAreaM2", "Totales m2"],
        ].map(([name, label]) => (
          <div key={name}>
            <label className={LABEL} htmlFor={name}>{label}</label>
            <input id={name} name={name} type="number" min={0} className={`${INPUT} mt-1`} />
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-[#0A2342] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar como borrador"}
        </button>
        <span className="text-[11px] text-slate-500">
          Se guarda sin publicar. Podes publicarla despues desde el listado.
        </span>
      </div>
    </form>
  );
}
