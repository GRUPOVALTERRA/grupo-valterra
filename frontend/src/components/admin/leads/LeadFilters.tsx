"use client";

import { useState } from "react";
import type { LeadStatus } from "@/services/mock-leads";

/**
 * Filtros del panel.
 * Por ahora UI-only con estado local; cuando se conecte a backend real,
 * pushear cambios a la URL (?estado=&q=) y leer en el server component.
 */

const STATUS_OPTIONS: { value: LeadStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "new", label: "Nuevos" },
  { value: "contacted", label: "Contactados" },
  { value: "qualified", label: "Calificados" },
  { value: "scheduled", label: "Visitas agendadas" },
  { value: "converted", label: "Convertidos" },
  { value: "lost", label: "Perdidos" },
  { value: "archived", label: "Archivados" },
];

interface LeadFiltersProps {
  onChange?: (filters: { q: string; status: LeadStatus | "" }) => void;
}

export function LeadFilters({ onChange }: LeadFiltersProps) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");

  const update = (next: { q?: string; status?: LeadStatus | "" }) => {
    const merged = { q: next.q ?? q, status: next.status ?? status };
    setQ(merged.q);
    setStatus(merged.status);
    onChange?.(merged);
  };

  const activeCount = [q, status].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#D8D8D8] bg-white p-3 shadow-sm">
      <div className="flex h-10 flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-[#D8D8D8] bg-white px-3 focus-within:border-[#0A2342]">
        <span aria-hidden className="text-slate-400">🔎</span>
        <input
          value={q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Buscar por nombre, email, teléfono o propiedad…"
          className="w-full bg-transparent text-sm text-[#0A2342] placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <label className="flex h-10 items-center gap-2 rounded-lg border border-[#D8D8D8] bg-white px-3 text-xs font-medium text-slate-500">
        <span className="hidden md:inline">Estado:</span>
        <select
          value={status}
          onChange={(e) => update({ status: e.target.value as LeadStatus | "" })}
          className="bg-transparent text-sm text-[#0A2342] focus:outline-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => update({ q: "", status: "" })}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          ✕ Limpiar ({activeCount})
        </button>
      )}
    </div>
  );
}
