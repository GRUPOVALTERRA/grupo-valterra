"use client";

import { useState, useTransition } from "react";

type OwnerInviteAction = (formData: FormData) => Promise<
  { ok: true; emailSent: boolean; note?: string } | { ok: false; error: string }
>;

interface Props {
  action: OwnerInviteAction;
  agencyName: string;
}

export function OwnerInviteSection({ action, agencyName }: Props) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 lg:px-8">
      <div className="rounded-lg border border-[#D8D8D8] bg-white">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setFeedback(null); }}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A86A]">
              {agencyName}
            </span>
            <span className="text-xs font-semibold text-[#0A2342]">Invitar miembro</span>
          </div>
          <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <form
            action={(fd) => {
              setFeedback(null);
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
            className="border-t border-[#D8D8D8] px-4 py-4 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="owner-invite-email" className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="owner-invite-email"
                  name="email"
                  type="email"
                  required
                  disabled={pending}
                  placeholder="nuevo@inmobiliaria.com"
                  className="mt-1 h-9 w-full rounded-md border border-[#D8D8D8] bg-white px-2.5 text-xs text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-invite-role" className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Rol <span className="text-red-500">*</span>
                </label>
                <select
                  id="owner-invite-role"
                  name="role"
                  required
                  disabled={pending}
                  defaultValue="agent"
                  className="mt-1 h-9 w-full appearance-none rounded-md border border-[#D8D8D8] bg-white px-2.5 text-xs text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="agent">agent</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>
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

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[#0A2342] px-4 text-xs font-bold text-white transition-colors hover:bg-[#071A32] disabled:opacity-60"
              >
                {pending ? "Enviando..." : "Enviar invitacion"}
              </button>
              <p className="text-[10px] text-slate-400">
                El invitado recibirá un magic link de un solo uso.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
