"use client";

import { useState } from "react";

const TABS = [
  { key: "comprar", label: "Comprar" },
  { key: "alquilar", label: "Alquilar" },
  { key: "emprendimientos", label: "Emprendimientos" },
] as const;

const CHIPS = [
  "Corrientes",
  "Resistencia",
  "Posadas",
  "Barrio cerrado",
  "Frente al río",
];

export function SearchBar() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("comprar");
  const [location, setLocation] = useState("");

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-[0_20px_60px_-20px_rgba(10,35,66,0.4)] backdrop-blur-md">
      <div className="flex border-b border-[#D8D8D8]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-3.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              tab === t.key
                ? "bg-[#0A2342] text-white"
                : "text-[#0A2342] hover:bg-[#F8F7F4]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-0 md:grid-cols-[1.4fr_1fr_auto]">
        <div className="flex items-center gap-3 border-b border-[#D8D8D8] px-4 py-3.5 md:border-b-0 md:border-r">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A2342" strokeWidth="2">
            <path d="M12 22s-7-7-7-13a7 7 0 0114 0c0 6-7 13-7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ubicación
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ciudad, barrio, country, zona..."
              className="w-full bg-transparent text-sm text-[#0A2342] placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-[#D8D8D8] px-4 py-3.5 md:border-b-0 md:border-r">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A2342" strokeWidth="2">
            <path d="M3 21V8l9-5 9 5v13" />
            <path d="M9 21V12h6v9" />
          </svg>
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Tipo de propiedad
            </label>
            <div className="relative">
              <select className="w-full appearance-none bg-transparent pr-6 text-sm text-[#0A2342] focus:outline-none">
                <option value="">Cualquiera</option>
                <option value="casa">Casa</option>
                <option value="departamento">Departamento</option>
                <option value="country">Country</option>
                <option value="terreno">Terreno</option>
                <option value="local">Local</option>
                <option value="oficina">Oficina</option>
                <option value="campo">Campo</option>
              </select>
              <svg
                aria-hidden
                className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-500"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center justify-center gap-2 bg-[#C9A86A] px-6 py-4 text-sm font-bold text-[#0A2342] transition-all hover:brightness-105 md:px-8"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          Buscar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#D8D8D8] bg-[#F8F7F4]/50 px-4 py-3 text-xs">
        <span className="font-medium text-slate-600">Búsquedas rápidas:</span>
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setLocation(c)}
            className="rounded-full bg-white px-3 py-1 text-[#0A2342] shadow-sm transition-colors hover:bg-[#0A2342] hover:text-white"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
