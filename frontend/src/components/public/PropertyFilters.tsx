"use client";

import { useRef, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PropertyOperation, PropertyType } from "@/services/mock-properties";

interface CurrentFilters {
  operationType?: PropertyOperation;
  propertyType?: PropertyType;
  city?: string;
}

interface PropertyFiltersProps {
  currentFilters: CurrentFilters;
}

const OPERATION_OPTIONS: { value: "" | PropertyOperation; label: string }[] = [
  { value: "", label: "Todas las operaciones" },
  { value: "venta", label: "En venta" },
  { value: "alquiler", label: "En alquiler" },
  { value: "alquiler-temporal", label: "Alquiler temporal" },
];

const TYPE_OPTIONS: { value: "" | PropertyType; label: string }[] = [
  { value: "", label: "Todos los tipos" },
  { value: "casa", label: "Casa" },
  { value: "departamento", label: "Departamento" },
  { value: "ph", label: "PH" },
  { value: "terreno", label: "Terreno" },
  { value: "local", label: "Local" },
  { value: "oficina", label: "Oficina" },
  { value: "campo", label: "Campo" },
  { value: "country", label: "Country" },
];

function buildUrl(filters: {
  operationType?: string;
  propertyType?: string;
  city?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.operationType) params.set("operationType", filters.operationType);
  if (filters.propertyType) params.set("propertyType", filters.propertyType);
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  const qs = params.toString();
  return `/propiedades${qs ? `?${qs}` : ""}`;
}

export function PropertyFilters({ currentFilters }: PropertyFiltersProps) {
  const router = useRouter();
  const cityRef = useRef<HTMLInputElement>(null);

  function handleOperationChange(e: ChangeEvent<HTMLSelectElement>) {
    router.push(
      buildUrl({
        operationType: e.target.value || undefined,
        propertyType: currentFilters.propertyType,
        city: cityRef.current?.value || undefined,
      }),
    );
  }

  function handleTypeChange(e: ChangeEvent<HTMLSelectElement>) {
    router.push(
      buildUrl({
        operationType: currentFilters.operationType,
        propertyType: e.target.value || undefined,
        city: cityRef.current?.value || undefined,
      }),
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(
      buildUrl({
        operationType: currentFilters.operationType,
        propertyType: currentFilters.propertyType,
        city: cityRef.current?.value || undefined,
      }),
    );
  }

  function handleClear() {
    router.push("/propiedades");
  }

  const hasFilters = Boolean(
    currentFilters.operationType ?? currentFilters.propertyType ?? currentFilters.city,
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#D8D8D8] bg-white p-4 shadow-[0_2px_12px_-4px_rgba(10,35,66,0.08)]"
    >
      {/* Operation */}
      <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        <label
          htmlFor="filter-operation"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Operación
        </label>
        <select
          id="filter-operation"
          value={currentFilters.operationType ?? ""}
          onChange={handleOperationChange}
          className="h-10 rounded-lg border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        >
          {OPERATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Property type */}
      <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        <label
          htmlFor="filter-type"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Tipo
        </label>
        <select
          id="filter-type"
          value={currentFilters.propertyType ?? ""}
          onChange={handleTypeChange}
          className="h-10 rounded-lg border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* City */}
      <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
        <label
          htmlFor="filter-city"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Ciudad
        </label>
        <input
          ref={cityRef}
          id="filter-city"
          key={currentFilters.city ?? "city-empty"}
          type="text"
          defaultValue={currentFilters.city ?? ""}
          placeholder="Ej: Corrientes"
          className="h-10 rounded-lg border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] placeholder:text-slate-400 focus:border-[#0A2342] focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          className="h-10 rounded-lg bg-[#0A2342] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0A2342]/90"
        >
          Buscar
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="h-10 rounded-lg border border-[#D8D8D8] px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>
    </form>
  );
}
