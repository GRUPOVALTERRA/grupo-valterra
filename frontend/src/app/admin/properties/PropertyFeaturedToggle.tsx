"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPropertyFeaturedAction } from "./actions";

/**
 * S19 — botón para destacar/quitar de la portada.
 *
 * `featured` es lo único que decide qué aparece en "Propiedades destacadas"
 * de la home, y la home además exige que esté publicada: por eso, si la
 * propiedad no está publicada, el botón avisa que no se verá todavía.
 */
export function PropertyFeaturedToggle({
  slug,
  featured,
  published,
  canManage,
}: {
  slug: string;
  featured: boolean;
  published: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("featured", String(!featured));
    const res = await setPropertyFeaturedAction(fd);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo cambiar el destaque");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title={
          published
            ? featured
              ? "Quitar de la portada"
              : "Mostrar en la portada del sitio"
            : "Se destaca ahora, pero recién aparece en la portada cuando la publiques"
        }
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${
          featured
            ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#8A6D18] hover:bg-[#C9A84C]/25"
            : "border-[#D8D8D8] bg-white text-[#0A2342] hover:bg-[#F8F7F4]"
        } disabled:opacity-50`}
      >
        <span aria-hidden>{featured ? "★" : "☆"}</span>
        {pending ? "…" : featured ? "En portada" : "Destacar"}
      </button>
      {featured && !published && (
        <span className="text-[10px] text-amber-700">Publicala para que se vea</span>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
