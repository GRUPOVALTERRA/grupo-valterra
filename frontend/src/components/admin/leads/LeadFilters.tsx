"use client";

import { useRef, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LEAD_STATUS_FILTER,
  DEFAULT_NOTIFY_FILTER,
  LEAD_STATUS_FILTER_LABEL,
  NOTIFY_FILTERS,
  NOTIFY_FILTER_LABEL,
  activeFilterCount,
  type LeadListFilters,
} from "@/lib/admin-lead-filter";

/**
 * Filtros de la bandeja — Sprint 16, PR2.
 *
 * Antes este componente guardaba el término en estado local y llamaba a un
 * `onChange` que el dashboard nunca le pasaba: escribir en el buscador no
 * filtraba nada. Ahora el filtro vive en la URL (`?q=&estado=&aviso=`) y lo
 * aplica el server component, igual que en el listado de propiedades (S15-B).
 * Así la vista sobrevive a un refresh, se puede compartir y el botón Atrás
 * hace lo que el operador espera.
 *
 * Los valores por defecto no se escriben en la URL: `/admin/leads` y
 * `?aviso=all&estado=all` son la misma vista.
 */

const BASE_PATH = "/admin/leads";

const STATUS_OPTIONS = (
  Object.keys(LEAD_STATUS_FILTER_LABEL) as (keyof typeof LEAD_STATUS_FILTER_LABEL)[]
).map((value) => ({ value, label: LEAD_STATUS_FILTER_LABEL[value] }));

const NOTIFY_OPTIONS = NOTIFY_FILTERS.map((value) => ({
  value,
  label: NOTIFY_FILTER_LABEL[value],
}));

function buildUrl(next: { q?: string; estado?: string; aviso?: string }): string {
  const params = new URLSearchParams();
  const q = next.q?.trim();
  if (q) params.set("q", q);
  if (next.estado && next.estado !== DEFAULT_LEAD_STATUS_FILTER) {
    params.set("estado", next.estado);
  }
  if (next.aviso && next.aviso !== DEFAULT_NOTIFY_FILTER) {
    params.set("aviso", next.aviso);
  }
  const qs = params.toString();
  return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
}

export function LeadFilters({
  filters,
  resultCount,
}: {
  filters: LeadListFilters;
  resultCount: number;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const activeCount = activeFilterCount(filters);

  // Cambiar un select NO pisa lo que el operador ya escribió en el buscador:
  // se lee el valor vigente del input y se conserva en la URL nueva.
  const currentQ = () => searchRef.current?.value ?? filters.q;

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl({ q: currentQ(), estado: e.target.value, aviso: filters.aviso }));
  }

  function handleNotifyChange(e: ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl({ q: currentQ(), estado: filters.estado, aviso: e.target.value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(buildUrl({ q: currentQ(), estado: filters.estado, aviso: filters.aviso }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#D8D8D8] bg-white p-3 shadow-sm"
    >
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <label
          htmlFor="admin-lead-search"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Buscar
        </label>
        <input
          ref={searchRef}
          id="admin-lead-search"
          name="q"
          type="search"
          key={filters.q || "q-empty"}
          defaultValue={filters.q}
          placeholder="Nombre, email, teléfono o propiedad"
          className="h-9 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] placeholder:text-slate-400 focus:border-[#0A2342] focus:outline-none"
        />
      </div>

      <div className="flex min-w-[170px] flex-col gap-1.5">
        <label
          htmlFor="admin-lead-status"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Estado
        </label>
        <select
          id="admin-lead-status"
          name="estado"
          value={filters.estado}
          onChange={handleStatusChange}
          className="h-9 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[190px] flex-col gap-1.5">
        <label
          htmlFor="admin-lead-notify"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Aviso por correo
        </label>
        <select
          id="admin-lead-notify"
          name="aviso"
          value={filters.aviso}
          onChange={handleNotifyChange}
          className="h-9 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        >
          {NOTIFY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[#0A2342] px-4 text-xs font-semibold text-white hover:brightness-110"
        >
          Buscar
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => router.push(BASE_PATH)}
            className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-[#F8F7F4]"
          >
            Limpiar ({activeCount})
          </button>
        )}
      </div>

      {/* El conteo visible está en la cabecera; acá va para lectores de
          pantalla, que necesitan enterarse de que el listado cambió. */}
      <output aria-live="polite" className="sr-only">
        {resultCount} {resultCount === 1 ? "consulta" : "consultas"} tras aplicar los filtros
      </output>
    </form>
  );
}
