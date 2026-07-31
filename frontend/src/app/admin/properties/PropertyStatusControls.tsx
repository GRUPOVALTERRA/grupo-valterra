"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { setPropertyStatusAction } from "./actions";
import { STATUS_LABEL, type PropertyStatus } from "@/lib/property-status";

/** Acciones ofrecidas según el estado actual. */
const ACTIONS: Record<PropertyStatus, { to: PropertyStatus; label: string; confirm?: string }[]> = {
  draft: [
    { to: "published", label: "Publicar" },
    { to: "archived", label: "Archivar", confirm: "¿Archivar esta propiedad? Deja de estar disponible en el panel operativo." },
  ],
  published: [
    { to: "unpublished", label: "Despublicar", confirm: "¿Despublicar? Deja de verse en el sitio publico, no se borra nada." },
    { to: "archived", label: "Archivar", confirm: "¿Archivar esta propiedad? Sale del sitio y del listado operativo." },
  ],
  unpublished: [
    { to: "published", label: "Publicar" },
    { to: "archived", label: "Archivar", confirm: "¿Archivar esta propiedad?" },
  ],
  archived: [{ to: "unpublished", label: "Restaurar" }],
};

export function PropertyStatusControls({
  slug,
  status,
  canManage,
}: {
  slug: string;
  status: PropertyStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    { to: PropertyStatus; label: string; message: string } | null
  >(null);

  if (!canManage) return null;

  const run = async (to: PropertyStatus) => {
    setConfirming(null);
    if (pending) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("status", to);
    const res = await setPropertyStatusAction(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo cambiar el estado");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {(ACTIONS[status] ?? []).map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={pending}
            onClick={() =>
              a.confirm
                ? setConfirming({ to: a.to, label: a.label, message: a.confirm })
                : run(a.to)
            }
            className="inline-flex h-8 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-50"
          >
            {pending ? "…" : a.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `${confirming.label} propiedad` : ""}
        message={confirming?.message ?? ""}
        confirmLabel={confirming?.label ?? "Confirmar"}
        tone={confirming?.to === "archived" ? "danger" : "default"}
        onConfirm={() => confirming && run(confirming.to)}
        onCancel={() => setConfirming(null)}
      />
      <span className="sr-only">Estado actual: {STATUS_LABEL[status]}</span>
    </div>
  );
}
