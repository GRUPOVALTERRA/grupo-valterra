"use client";

import { useState, useTransition } from "react";

interface LoginFormProps {
  action: (formData: FormData) => Promise<{ ok: false; error: string } | void>;
  nextPath: string;
  initialError?: string;
}

export function LoginForm({ action, nextPath, initialError }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await action(fd);
          if (result && !result.ok) setError(result.error);
        });
      }}
      className="mt-6 space-y-4"
    >
      <input type="hidden" name="next" value={nextPath} />

      <div>
        <label
          htmlFor="password"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
        >
          Contraseña
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
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
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
    </form>
  );
}
