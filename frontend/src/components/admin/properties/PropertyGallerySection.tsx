"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  deletePropertyImageAction,
  movePropertyImageAction,
  setPropertyCoverAction,
  updatePropertyImageAltAction,
  uploadPropertyImagesAction,
} from "@/app/admin/properties/gallery-actions";
import { GALLERY_ERROR_MESSAGES, type GalleryActionResult } from "@/lib/gallery-result";

/**
 * S17 PR2 — sección "Galería" del editor administrativo.
 *
 * Recibe una vista RECORTADA de cada imagen: id (necesario para las acciones,
 * nunca se muestra), URL pública, alt y si es portada. El storage_path no
 * cruza al cliente. Todos los errores se muestran por código traducido; nunca
 * se expone la respuesta de Storage ni un error crudo.
 *
 * Diálogo de borrado React controlado — sin window.confirm/alert/prompt.
 */

export interface GalleryImageView {
  id: string;
  url: string | null;
  altText?: string;
  isCover: boolean;
}

interface Props {
  slug: string;
  images: GalleryImageView[];
  /** Visibilidad; la autorización real la repite cada server action. */
  canManage: boolean;
}

type Feedback = { kind: "ok" | "err"; msg: string } | null;

export function PropertyGallerySection({ slug, images, canManage }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<GalleryImageView | null>(null);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});

  if (!canManage) return null;

  function apply(run: () => Promise<GalleryActionResult>, okMsg: string) {
    if (pending) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await run();
      if (res.ok) {
        const extra =
          res.uploaded !== undefined
            ? ` (${res.uploaded} subida${res.uploaded === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} rechazada${res.skipped === 1 ? "" : "s"}` : ""})`
            : "";
        setFeedback({ kind: "ok", msg: `${okMsg}${extra}` });
      } else {
        setFeedback({ kind: "err", msg: GALLERY_ERROR_MESSAGES[res.code] });
      }
      router.refresh();
    });
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const fd = new FormData();
    fd.set("slug", slug);
    for (const f of Array.from(selected)) fd.append("files", f);
    if (fileRef.current) fileRef.current.value = "";
    apply(() => uploadPropertyImagesAction(fd), "Imágenes cargadas");
  }

  return (
    <section className="mt-8 rounded-lg border border-[#D8D8D8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#0A2342]">Galería</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            JPG, PNG o WebP · hasta 5 MB · entre 200 y 8000 px. La portada es la
            imagen que se ve en el listado.
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-[#0A2342] px-3 text-xs font-semibold text-white hover:brightness-110">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={pending}
            onChange={onFiles}
            className="hidden"
          />
          {pending ? "Procesando…" : "Agregar fotos"}
        </label>
      </div>

      {pending && (
        <p role="status" className="mt-3 text-xs font-medium text-slate-600">
          Subiendo y validando las imágenes…
        </p>
      )}

      {feedback && (
        <p
          role="alert"
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            feedback.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.msg}
        </p>
      )}

      {images.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[#D8D8D8] px-4 py-10 text-center">
          <p className="text-sm font-medium text-[#0A2342]">Todavía no hay fotos</p>
          <p className="mt-1 text-xs text-slate-500">
            Agregá la primera: se usará como portada y podés cambiarla cuando quieras.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, index) => (
            <li
              key={img.id}
              className="overflow-hidden rounded-lg border border-[#D8D8D8] bg-[#F8F7F4]/40"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-100">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview admin desde Storage; next/image llega en PR3
                  <img
                    src={img.url}
                    alt={img.altText ?? "Imagen de la propiedad"}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                    Sin vista previa
                  </div>
                )}
                {img.isCover && (
                  <span className="absolute left-2 top-2 rounded-full bg-[#C9A86A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A2342]">
                    Portada
                  </span>
                )}
              </div>

              <div className="space-y-2 p-2.5">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Descripción (alt)
                  <input
                    type="text"
                    maxLength={300}
                    defaultValue={img.altText ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setAltDrafts((d) => ({ ...d, [img.id]: e.target.value }))
                    }
                    onBlur={() => {
                      const draft = altDrafts[img.id];
                      if (draft === undefined || draft === (img.altText ?? "")) return;
                      apply(
                        () => updatePropertyImageAltAction(slug, img.id, draft),
                        "Descripción actualizada",
                      );
                    }}
                    placeholder="Ej: frente de la casa"
                    className="mt-1 block w-full rounded-md border border-[#D8D8D8] px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[#0A2342]"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  {!img.isCover && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        apply(() => setPropertyCoverAction(slug, img.id), "Portada actualizada")
                      }
                      className="inline-flex h-7 items-center rounded-md border border-[#D8D8D8] bg-white px-2 text-[11px] font-semibold text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-50"
                    >
                      Usar como portada
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Mover antes"
                    disabled={pending || index === 0}
                    onClick={() =>
                      apply(() => movePropertyImageAction(slug, img.id, "up"), "Orden actualizado")
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#D8D8D8] bg-white text-xs text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Mover después"
                    disabled={pending || index === images.length - 1}
                    onClick={() =>
                      apply(() => movePropertyImageAction(slug, img.id, "down"), "Orden actualizado")
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#D8D8D8] bg-white text-xs text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmDelete(img)}
                    className="ml-auto inline-flex h-7 items-center rounded-md border border-red-200 bg-white px-2 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2342]/50 px-4"
          onClick={() => !pending && setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#D8D8D8] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="gallery-delete-title" className="text-base font-bold text-[#0A2342]">
              Eliminar esta imagen
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Se quita de la galería y se borra el archivo. No se puede deshacer.
              {confirmDelete.isCover &&
                " Como es la portada, pasará a serlo la primera imagen que quede."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDelete(null)}
                className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  apply(() => deletePropertyImageAction(slug, target.id), "Imagen eliminada");
                }}
                className="inline-flex h-9 items-center rounded-md bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
