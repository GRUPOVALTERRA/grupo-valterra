"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/admin/login/actions";

/**
 * Botón cerrar sesión.
 * Server action borra la cookie y redirige a /admin/login.
 */
export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(async () => {
          await logoutAction();
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] transition-colors hover:bg-[#F8F7F4] disabled:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending ? "Cerrando..." : "Cerrar sesión"}
      </button>
    </form>
  );
}
