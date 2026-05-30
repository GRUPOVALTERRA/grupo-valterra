"use client";

import { useState, useTransition } from "react";

type Action = (formData: FormData) => Promise<{ ok: boolean; error?: string; publicUrl?: string }>;

interface Props {
  action: Action;
  slug: string;
}

export function EditCoverForm({ action, slug }: Props) {
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string; url?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string>("");

  return (
    <form
      action={(fd) => {
        setFeedback(null);
        fd.set("slug", slug);
        startTransition(async () => {
          const r = await action(fd);
          if (r.ok) {
            setFeedback({ kind: "ok", msg: "Cover actualizada", url: r.publicUrl });
          } else {
            setFeedback({ kind: "err", msg: r.error ?? "Error desconocido" });
          }
        });
      }}
      className="mt-3 space-y-3 rounded-lg border border-[#D8D8D8] bg-white p-4"
    >
      <div>
        <label htmlFor="file" className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Archivo (jpeg / png / webp · max 5MB)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          disabled={pending}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="mt-1 block w-full text-xs text-[#0A2342] file:mr-3 file:rounded-md file:border-0 file:bg-[#0A2342] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#071A32]"
        />
        {fileName && <p className="mt-1 text-[11px] text-slate-500">{fileName}</p>}
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
          {feedback.kind === "ok" ? "✓ " : "⚠ "}
          {feedback.msg}
          {feedback.url && (
            <a href={feedback.url} target="_blank" rel="noreferrer" className="ml-2 underline">
              ver
            </a>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0A2342] text-xs font-bold text-white hover:bg-[#071A32] disabled:opacity-60"
      >
        {pending ? "Subiendo..." : "Subir cover"}
      </button>

      <p className="text-[10px] text-slate-500">
        El path se persiste en properties.cover_image. Render se actualiza automaticamente (revalidate).
      </p>
    </form>
  );
}
