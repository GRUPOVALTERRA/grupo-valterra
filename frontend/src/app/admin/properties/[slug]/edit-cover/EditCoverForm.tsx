"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";

type Action = (formData: FormData) => Promise<{ ok: boolean; error?: string; publicUrl?: string }>;

interface Props {
  action: Action;
  slug: string;
  currentImage: string | null;
}

/**
 * MF2 unified editor.
 * Single client component owns BOTH the image preview panel AND the form,
 * so selecting a file immediately swaps the displayed image (no HTTP cache
 * dependency, no F5 needed). Pure blob URL for instant feedback.
 */
export function EditCoverForm({ action, slug, currentImage }: Props) {
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; msg: string; url?: string } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<boolean>(false);

  // Cleanup blob URL on unmount or replacement
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = e.target.files?.[0];
    if (!file) {
      setFileName("");
      setPreviewUrl(null);
      setUploaded(false);
      setFeedback(null);
      return;
    }
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    setUploaded(false);
    setFeedback(null);
  }

  // Displayed image: preview > current
  const displayImage = previewUrl ?? currentImage;
  const displayLabel = previewUrl
    ? uploaded
      ? "✓ Imagen subida (vista local)"
      : "Vista previa local (sin subir aún)"
    : currentImage
      ? "Imagen actual (cacheada del último upload)"
      : "Sin imagen";

  return (
    <section className="grid gap-6 md:grid-cols-[1fr_1fr]">
      {/* PANEL IZQUIERDO · imagen reactiva */}
      <div>
        <h2 className="text-sm font-semibold text-[#0A2342]">{displayLabel}</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-[#D8D8D8] bg-slate-50">
          {displayImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview · blob URL o resolved Storage URL
            <img
              src={displayImage}
              alt={previewUrl ? "Vista previa local" : "Imagen actual de la property"}
              className="block aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/10] w-full items-center justify-center text-xs text-slate-400">
              Sin imagen
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          {previewUrl
            ? "URL blob temporal del archivo seleccionado · cero red"
            : "URL pública servida desde Supabase Storage (sujeto a cache HTTP del browser)"}
        </p>
      </div>

      {/* PANEL DERECHO · form de upload */}
      <div>
        <form
          action={(fd) => {
            setFeedback(null);
            fd.set("slug", slug);
            startTransition(async () => {
              const r = await action(fd);
              if (r && r.ok) {
                setFeedback({ kind: "ok", msg: "Cover actualizada", url: r.publicUrl });
                setUploaded(true);
              } else if (r && !r.ok) {
                setFeedback({ kind: "err", msg: r.error ?? "Error desconocido" });
              }
            });
          }}
          className="space-y-3 rounded-lg border border-[#D8D8D8] bg-white p-4"
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
              onChange={handleFileChange}
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
                  ver en Storage
                </a>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !previewUrl || uploaded}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0A2342] text-xs font-bold text-white hover:bg-[#071A32] disabled:opacity-60"
          >
            {pending
              ? "Subiendo..."
              : uploaded
                ? "Subido · seleccioná otra para reemplazar"
                : !previewUrl
                  ? "Seleccioná un archivo primero"
                  : "Subir cover"}
          </button>

          <p className="text-[10px] text-slate-500">
            Preview local instantánea en el panel izquierdo · al subir queda en Storage como portada · el &quot;ver en Storage&quot; abre la URL pública verificable.
          </p>
        </form>
      </div>
    </section>
  );
}
