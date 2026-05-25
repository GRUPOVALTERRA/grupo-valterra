"use client";

import { useState, useTransition } from "react";

interface Props {
  action: (formData: FormData) => Promise<{ ok: false; error: string } | void>;
}

export function CreateAgencyForm({ action }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await action(fd);
          if (r && !r.ok) setError(r.error);
        });
      }}
      className="mt-3 space-y-3 rounded-lg border border-[#D8D8D8] bg-white p-4"
    >
      <Field name="slug" label="Slug (URL)" placeholder="inmobiliaria-x" required />
      <Field name="name" label="Nombre" placeholder="Inmobiliaria X" required />
      <Field name="contact_email" label="Email de contacto" placeholder="contacto@..." type="email" />
      <Field name="contact_phone" label="Telefono" placeholder="+54 9 ..." />
      <div className="grid grid-cols-2 gap-3">
        <Field name="city" label="Ciudad" placeholder="Corrientes" />
        <Field name="province" label="Provincia" placeholder="Corrientes" />
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          ⚠ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0A2342] text-xs font-bold text-white transition-colors hover:bg-[#071A32] disabled:opacity-60"
      >
        {pending ? "Creando..." : "Crear agency"}
      </button>
    </form>
  );
}

function Field({
  name, label, placeholder, type = "text", required,
}: { name: string; label: string; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        id={`f-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-md border border-[#D8D8D8] bg-white px-2.5 text-xs text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
      />
    </div>
  );
}
