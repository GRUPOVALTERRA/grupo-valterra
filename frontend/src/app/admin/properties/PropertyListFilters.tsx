"use client";

import { useRef, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_STATUS_FILTERS,
  ADMIN_STATUS_FILTER_LABEL,
  DEFAULT_STATUS_FILTER,
  type AdminStatusFilter,
} from "@/lib/admin-property-filter";

/**
 * Filtros del listado administrativo — Sprint 15-B.
 *
 * El estado vive en la URL (`?estado=&q=`), no en el componente. Tres razones
 * concretas, no estilo:
 *  1. el filtrado ocurre en la base, así que la página tiene que poder
 *     re-renderizarse en el servidor con el filtro puesto;
 *  2. publicar o archivar dispara `router.refresh()`; con el filtro en la URL,
 *     el operador vuelve a la misma vista y no al listado completo;
 *  3. una vista filtrada se puede compartir o dejar abierta en una pestaña.
 *
 * El default ("Activas") no viaja en la URL: `/admin/properties` y
 * `?estado=active` son la misma vista, y el select lo muestra seleccionado para
 * que quede claro que el listado no está mostrando todo.
 */

const BASE_PATH = "/admin/properties";

const STATUS_OPTIONS = ADMIN_STATUS_FILTERS.map((value) => ({
  value,
  label: ADMIN_STATUS_FILTER_LABEL[value],
}));

function buildUrl(next: { estado?: string; q?: string }): string {
  const params = new URLSearchParams();
  // El default no se escribe: la URL canónica del listado no lleva `estado`.
  if (next.estado && next.estado !== DEFAULT_STATUS_FILTER) params.set("estado", next.estado);
  const q = next.q?.trim();
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
}

export function PropertyListFilters({
  estado,
  q,
  resultCount,
}: {
  estado: AdminStatusFilter;
  q: string;
  resultCount: number;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const activeCount = [estado !== DEFAULT_STATUS_FILTER, Boolean(q)].filter(Boolean).length;

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl({ estado: e.target.value, q: searchRef.current?.value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(buildUrl({ estado, q: searchRef.current?.value }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[#D8D8D8] bg-white p-3"
    >
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <label
          htmlFor="admin-property-search"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Buscar
        </label>
        <input
          ref={searchRef}
          id="admin-property-search"
          name="q"
          type="search"
          key={q || "q-empty"}
          defaultValue={q}
          placeholder="Titulo, slug, ciudad o barrio"
          className="h-9 rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] placeholder:text-slate-400 focus:border-[#0A2342] focus:outline-none"
        />
      </div>

      <div className="flex min-w-[180px] flex-col gap-1.5">
        <label
          htmlFor="admin-property-status"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >
          Estado
        </label>
        <select
          id="admin-property-status"
          name="estado"
          value={estado}
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

      {/* El conteo ya está en la cabecera; acá va sólo para lectores de pantalla,
          que necesitan enterarse de que el listado cambió al filtrar. */}
      <output aria-live="polite" className="sr-only">
        {resultCount} {resultCount === 1 ? "propiedad" : "propiedades"} tras aplicar los filtros
      </output>
    </form>
  );
}
