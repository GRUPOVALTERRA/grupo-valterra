"use client";

import { useState, useTransition } from "react";
import type { AgencyMemberLite } from "@/services/agencies";

type MemberAction = (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
type RoleAction = (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;

const ROLES = ["owner", "admin", "agent", "viewer"] as const;

interface Props {
  members: AgencyMemberLite[];
  currentUserId: string | null;
  updateAction: RoleAction;
  removeAction: MemberAction;
}

interface RowFeedback {
  kind: "ok" | "err";
  msg: string;
}

function formatDate(val: string | null): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function MemberRow({
  member,
  isSelf,
  updateAction,
  removeAction,
}: {
  member: AgencyMemberLite;
  isSelf: boolean;
  updateAction: RoleAction;
  removeAction: MemberAction;
}) {
  const [feedback, setFeedback] = useState<RowFeedback | null>(null);
  const [selectedRole, setSelectedRole] = useState(member.role);
  const [updatePending, startUpdate] = useTransition();
  const [removePending, startRemove] = useTransition();

  const pending = updatePending || removePending;

  function handleUpdate() {
    setFeedback(null);
    startUpdate(async () => {
      const fd = new FormData();
      fd.set("userId", member.user_id);
      fd.set("role", selectedRole);
      const r = await updateAction(fd);
      setFeedback(r.ok ? { kind: "ok", msg: "Rol actualizado" } : { kind: "err", msg: r.error });
    });
  }

  function handleRemove() {
    setFeedback(null);
    startRemove(async () => {
      const fd = new FormData();
      fd.set("userId", member.user_id);
      const r = await removeAction(fd);
      if (!r.ok) setFeedback({ kind: "err", msg: r.error });
      // ok → revalidatePath refrescará la lista en el server
    });
  }

  return (
    <li className="flex flex-col gap-2 border-t border-[#D8D8D8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-slate-500 truncate max-w-[160px]" title={member.user_id}>
            {member.user_id.slice(0, 8)}…
          </span>
          {isSelf && (
            <span className="rounded-full bg-[#C9A86A]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#C9A86A]">
              Tú
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-slate-400">
          {member.joined_at
            ? `Ingresó ${formatDate(member.joined_at)}`
            : member.invited_at
              ? `Invitado ${formatDate(member.invited_at)}`
              : "Pendiente"}
        </div>
        {feedback && (
          <div
            role="alert"
            className={`mt-1 rounded px-2 py-1 text-[10px] ${
              feedback.kind === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {feedback.kind === "ok" ? "✓ " : "⚠ "}{feedback.msg}
          </div>
        )}
      </div>

      {isSelf ? (
        <span className="rounded-full bg-[#0A2342] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
          {member.role}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as typeof ROLES[number])}
            disabled={pending}
            className="h-8 appearance-none rounded-md border border-[#D8D8D8] bg-white px-2 text-[11px] text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={pending || selectedRole === member.role}
            className="h-8 rounded-md border border-[#0A2342] bg-white px-2.5 text-[11px] font-semibold text-[#0A2342] transition-colors hover:bg-[#F8F7F4] disabled:opacity-40"
          >
            {updatePending ? "…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="h-8 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
          >
            {removePending ? "…" : "Remover"}
          </button>
        </div>
      )}
    </li>
  );
}

export function MembersSection({ members, currentUserId, updateAction, removeAction }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-2 lg:px-8">
      <div className="rounded-lg border border-[#D8D8D8] bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A86A]">
              Equipo
            </span>
            <span className="text-xs font-semibold text-[#0A2342]">
              {members.length} {members.length === 1 ? "miembro" : "miembros"}
            </span>
          </div>
          <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <ul className="border-t border-[#D8D8D8]">
            {members.length === 0 ? (
              <li className="px-4 py-4 text-xs text-slate-500">Sin miembros aún.</li>
            ) : (
              members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isSelf={!!currentUserId && m.user_id === currentUserId}
                  updateAction={updateAction}
                  removeAction={removeAction}
                />
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
