"use client";

import { useState, useTransition } from "react";

type InviteAction = (formData: FormData) => Promise<
  { ok: true; emailSent: boolean; note?: string } | { ok: false; error: string }
>;

interface Props {
  action: InviteAction;
  agencySlug: string;
}

export function InviteMemberForm({ action, agencySlug }: Props) {
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        setFeedback(null);
        fd.set("agencySlug", agencySlug);
        startTransition(async () => {
          const r = await action(fd);
          if (r.ok) {
            const msg = r.emailSent
              ? "Invitacion enviada por email"
              : r.note ?? "Link generado (email no enviado, revisar logs)";
            setFeedback({ kind: "ok", msg });
          } else {
            setFeedback({ kind: "err", msg: r.error });
          }
        });
      }}
      className="mt-3 space-y-3 rounded-lg border border-[#D8D8D8] bg-white p-4"
    >
      <div>
        <label htmlFor="invite-email" className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="nuevo@inmobiliaria.com"
          className="mt-1 h-9 w-full rounded-md border border-[#D8D8D8] bg-white px-2.5 text-xs text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Rol <span className="text-red-500">*</span>
        </label>
        <select
          id="invite-role"
          name="role"
          required
          defaultValue="owner"
          className="mt-1 h-9 w-full appearance-none rounded-md border border-[#D8D8D8] bg-white px-2.5 text-xs text-[#0A2342] focus:border-[#0A2342] focus:outline-none"
        >
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="agent">agent</option>
          <option value="viewer">viewer</option>
        </select>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`rounded-md border px-2.5 py-1.5 text-[11px] ${
            feedback.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.kind === "ok" ? "✓ " : "⚠ "}{feedback.msg}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0A2342] text-xs font-bold text-white transition-colors hover:bg-[#071A32] disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviar invitacion"}
      </button>

      <p className="text-[10px] text-slate-500">
        El invitado recibira un magic link de un solo uso. Si el email ya existe, contactalo manualmente.
      </p>
    </form>
  );
}
