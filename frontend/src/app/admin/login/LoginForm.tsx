"use client";

import { useState, useTransition } from "react";

type LegacyAction = (formData: FormData) => Promise<{ ok: false; error: string } | void>;
type MagicAction = (formData: FormData) => Promise<{ ok: true; sent: true } | { ok: false; error: string }>;

interface LoginFormProps {
  legacyAction: LegacyAction;
  magicAction: MagicAction;
  nextPath: string;
  initialError?: string;
}

export function LoginForm({ legacyAction, magicAction, nextPath, initialError }: LoginFormProps) {
  const initialMsg = (() => {
    switch (initialError) {
      case "missing-code": return "Link incompleto. Solicitá uno nuevo.";
      case "invalid-link": return "El link expiró o ya fue usado.";
      case "server-config": return "Error de configuración del servidor.";
      case undefined: return null;
      default: return initialError;
    }
  })();

  const [tab, setTab] = useState<"magic" | "legacy">("magic");
  const [error, setError] = useState<string | null>(initialMsg);
  const [magicSent, setMagicSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleMagic = (fd: FormData) => {
    setError(null);
    setMagicSent(false);
    startTransition(async () => {
      const result = await magicAction(fd);
      if (result.ok) setMagicSent(true);
      else setError(result.error);
    });
  };

  const handleLegacy = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await legacyAction(fd);
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <div className="mt-6">
      <div className="flex gap-1 rounded-lg bg-[#F8F7F4] p-1">
        <button
          type="button"
          onClick={() => { setTab("magic"); setError(null); }}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
            tab === "magic" ? "bg-white text-[#0A2342] shadow-sm" : "text-[#4A5568] hover:text-[#0A2342]"
          }`}
        >
          Magic link
        </button>
        <button
          type="button"
          onClick={() => { setTab("legacy"); setError(null); setMagicSent(false); }}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
            tab === "legacy" ? "bg-white text-amber-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Emergencia
        </button>
      </div>

      {tab === "magic" ? (
        magicSent ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Si el email pertenece a una agency registrada, recibirás un link de acceso en tu inbox.
            <button
              type="button"
              onClick={() => setMagicSent(false)}
              className="mt-2 block text-xs font-semibold underline-offset-4 hover:underline"
            >
              Enviar a otro email
            </button>
          </div>
        ) : (
          <form action={handleMagic} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                disabled={pending}
                placeholder="tu@inmobiliaria.com"
                className="mt-1 h-11 w-full rounded-lg border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A2342] text-sm font-bold text-white transition-all hover:bg-[#071A32] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Enviando link..." : "Enviarme link de acceso"}
            </button>

            <p className="text-[11px] text-slate-500">
              Recibirás un email con un link de un solo uso. No necesitás contraseña.
            </p>
          </form>
        )
      ) : (
        <form action={handleLegacy} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Contraseña super-admin
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              disabled={pending}
              className="mt-1 h-11 w-full rounded-lg border border-[#D8D8D8] bg-white px-3 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A2342] text-sm font-bold text-white transition-all hover:bg-[#071A32] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Verificando..." : "Entrar al panel"}
          </button>

          <p className="text-[11px] text-amber-600">
            ⚠ Uso de emergencia. Preferir Magic Link para acceso normal.
          </p>
        </form>
      )}
    </div>
  );
}
