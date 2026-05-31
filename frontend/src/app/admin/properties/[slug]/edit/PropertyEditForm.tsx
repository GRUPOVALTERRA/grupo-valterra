"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Property } from "@/services/mock-properties";

type Action = (formData: FormData) => Promise<{
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}>;

interface Props {
  action: Action;
  slug: string;
  property: Property;
}

const OPERATION_OPTIONS = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
  { value: "alquiler-temporal", label: "Alquiler temporal" },
] as const;

const TYPE_OPTIONS = [
  { value: "casa", label: "Casa" },
  { value: "departamento", label: "Departamento" },
  { value: "ph", label: "PH" },
  { value: "terreno", label: "Terreno" },
  { value: "local", label: "Local" },
  { value: "oficina", label: "Oficina" },
  { value: "campo", label: "Campo" },
  { value: "country", label: "Country" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "ARS", label: "ARS" },
] as const;

export function PropertyEditForm({ action, slug, property }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initial published state from current DB value (defaults to true only if
  // upstream returns undefined · should never happen with rowToProperty mapping it
  // explicitly · safety fallback).
  // Critical: opening + saving an unpublished property MUST NOT auto-publish.
  const [published, setPublished] = useState<boolean>(property.published ?? true);

  const badgesInitial = property.badges?.join(", ") ?? "";

  return (
    <form
      action={(fd) => {
        setFeedback(null);
        setFieldErrors({});
        fd.set("slug", slug);
        fd.set("published", published ? "true" : "false");
        startTransition(async () => {
          const r = await action(fd);
          if (r.ok) {
            setFeedback({ kind: "ok", msg: "Cambios guardados" });
            router.refresh();
          } else {
            setFeedback({ kind: "err", msg: r.error ?? "Error desconocido" });
            if (r.fieldErrors) setFieldErrors(r.fieldErrors);
          }
        });
      }}
      className="space-y-5"
    >
      {/* Publish toggle */}
      <div className="rounded-lg border border-[#C9A86A]/40 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C9A86A]">
              Estado de publicacion
            </div>
            <div className="mt-1 text-sm text-[#0A2342]">
              {published
                ? "Publicada · visible en /propiedades y portales"
                : "Borrador · NO visible al publico (solo admin)"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPublished(true)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                published
                  ? "bg-[#0A2342] text-white"
                  : "border border-[#D8D8D8] bg-white text-[#0A2342]"
              }`}
            >
              Publicada
            </button>
            <button
              type="button"
              onClick={() => setPublished(false)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                !published
                  ? "bg-[#0A2342] text-white"
                  : "border border-[#D8D8D8] bg-white text-[#0A2342]"
              }`}
            >
              Borrador
            </button>
          </div>
        </div>
      </div>

      {/* Datos comerciales */}
      <Section title="Datos comerciales">
        <FieldText name="title" label="Titulo" defaultValue={property.title} required error={fieldErrors.title} disabled={pending} />
        <FieldTextarea name="description" label="Descripcion (opcional, sin HTML)" defaultValue={property.description ?? ""} rows={4} error={fieldErrors.description} disabled={pending} />
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldNumber name="price" label="Precio" defaultValue={String(property.price ?? 0)} required step="0.01" error={fieldErrors.price} disabled={pending} />
          <FieldSelect name="currency" label="Currency" defaultValue={property.currency} options={CURRENCY_OPTIONS} error={fieldErrors.currency} disabled={pending} />
          <FieldSelect name="operation_type" label="Operacion" defaultValue={property.operation} options={OPERATION_OPTIONS} error={fieldErrors.operation_type} disabled={pending} />
        </div>
        <FieldSelect name="property_type" label="Tipo de property" defaultValue={property.type} options={TYPE_OPTIONS} error={fieldErrors.property_type} disabled={pending} />
      </Section>

      {/* Ubicacion */}
      <Section title="Ubicacion">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldText name="city" label="Ciudad" defaultValue={property.city} required error={fieldErrors.city} disabled={pending} />
          <FieldText name="province" label="Provincia" defaultValue={property.province} required error={fieldErrors.province} disabled={pending} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldText name="neighborhood" label="Barrio (opcional)" defaultValue={property.neighborhood ?? ""} error={fieldErrors.neighborhood} disabled={pending} />
          <FieldText name="address" label="Direccion (opcional)" defaultValue="" error={fieldErrors.address} disabled={pending} />
        </div>
      </Section>

      {/* Ambientes */}
      <Section title="Ambientes y superficie">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldNumber name="bedrooms" label="Dormitorios" defaultValue={property.bedrooms !== undefined ? String(property.bedrooms) : ""} error={fieldErrors.bedrooms} disabled={pending} />
          <FieldNumber name="bathrooms" label="Banos" defaultValue={property.bathrooms !== undefined ? String(property.bathrooms) : ""} error={fieldErrors.bathrooms} disabled={pending} />
          <FieldNumber name="parking" label="Cocheras" defaultValue={property.parking !== undefined ? String(property.parking) : ""} error={fieldErrors.parking} disabled={pending} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldNumber name="covered_area_m2" label="Sup. cubierta (m2)" defaultValue={property.coveredArea !== undefined ? String(property.coveredArea) : ""} step="0.01" error={fieldErrors.covered_area_m2} disabled={pending} />
          <FieldNumber name="total_area_m2" label="Sup. total (m2)" defaultValue={property.totalArea !== undefined ? String(property.totalArea) : ""} step="0.01" error={fieldErrors.total_area_m2} disabled={pending} />
        </div>
      </Section>

      {/* Tags */}
      <Section title="Badges / tags">
        <FieldText
          name="badges"
          label="Badges separados por coma (max 10)"
          defaultValue={badgesInitial}
          error={fieldErrors.badges}
          disabled={pending}
        />
        <p className="text-[10px] text-slate-400">Ej: Frente al rio, Pileta, A estrenar</p>
      </Section>

      {/* Feedback */}
      {feedback && (
        <div
          role="alert"
          className={`rounded-md border px-3 py-2 text-xs ${
            feedback.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.kind === "ok" ? "✓ " : "⚠ "}
          {feedback.msg}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 border-t border-[#D8D8D8] pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#0A2342] px-6 text-xs font-bold text-white hover:bg-[#071A32] disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#D8D8D8] bg-white p-4">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#C9A86A]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface FieldBase {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

function FieldText({ name, label, defaultValue, required, disabled, error }: FieldBase) {
  return (
    <FieldShell name={name} label={label} required={required} error={error}>
      <input
        id={`f-${name}`}
        name={name}
        type="text"
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        className={inputClass(error)}
      />
    </FieldShell>
  );
}

function FieldTextarea({
  name, label, defaultValue, required, disabled, error, rows = 3,
}: FieldBase & { rows?: number }) {
  return (
    <FieldShell name={name} label={label} required={required} error={error}>
      <textarea
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        rows={rows}
        className={inputClass(error)}
      />
    </FieldShell>
  );
}

function FieldNumber({
  name, label, defaultValue, required, disabled, error, step,
}: FieldBase & { step?: string }) {
  return (
    <FieldShell name={name} label={label} required={required} error={error}>
      <input
        id={`f-${name}`}
        name={name}
        type="number"
        inputMode="decimal"
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        step={step ?? "1"}
        min="0"
        className={inputClass(error)}
      />
    </FieldShell>
  );
}

function FieldSelect({
  name, label, defaultValue, options, required, disabled, error,
}: FieldBase & { options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <FieldShell name={name} label={label} required={required} error={error}>
      <select
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        className={inputClass(error)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

function FieldShell({
  name, label, required, error, children,
}: { name: string; label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(error?: string): string {
  const base = "block w-full rounded-md border bg-white px-2.5 py-1.5 text-xs text-[#0A2342] focus:outline-none disabled:opacity-60";
  return error
    ? `${base} border-red-400 focus:border-red-500`
    : `${base} border-[#D8D8D8] focus:border-[#0A2342]`;
}
