"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { LOGO_TARGET_SIDE_PX } from "@/lib/agency-logo";
import { initialOf } from "@/lib/map/badge";
import {
  removeAgencyLogoAction,
  uploadAgencyLogoAction,
  type AgencyLogoActionResult,
} from "@/app/admin/agencia/actions";

/**
 * S26-MAP-02 — carga del logo miniatura.
 *
 * La miniatura la fabrica el NAVEGADOR: cualquier imagen (incluido SVG)
 * se dibuja en un canvas cuadrado de 256 px, con padding transparente
 * ("contain": nunca se recorta el logo), y se sube como PNG. El servidor
 * la vuelve a validar por contenido; esto es comodidad para el owner,
 * no seguridad.
 *
 * El bloque "así se ve en el pin" muestra el resultado real a 22 px
 * antes de subir: es el unico tamaño que importa.
 */

interface Props {
  slug: string;
  agencyName: string;
  currentLogoUrl: string | null;
  canEdit: boolean;
}

const MENSAJE: Record<string, string> = {
  forbidden: "Tu rol no puede cambiar el logo de esta agencia.",
  "not-found": "Agencia no encontrada.",
  "invalid-input": "Elegí una imagen primero.",
  rejected: "La imagen fue rechazada",
  "rate-limited": "Demasiados intentos. Esperá unos minutos y volvé a probar.",
  unavailable: "El servicio no está disponible en este momento.",
  failed: "No se pudo guardar el logo. Intentá de nuevo.",
};

const MOTIVO: Record<string, string> = {
  "too-heavy": "pesa más de 200 KB",
  "too-small": "mide menos de 200 px",
  "too-big": "mide más de 512 px",
  "not-square": "no es cuadrada",
  "type-mismatch": "el tipo declarado no coincide con el contenido",
  "not-decodable": "el archivo está dañado o truncado",
  "unrecognized-content": "no es un PNG, JPG ni WebP válido",
};

function describir(res: Extract<AgencyLogoActionResult, { ok: false }>): string {
  const base = MENSAJE[res.code] ?? MENSAJE.failed;
  if (res.code === "rejected" && res.reason && MOTIVO[res.reason]) {
    return `${base}: ${MOTIVO[res.reason]}.`;
  }
  return res.code === "rejected" ? `${base}.` : base;
}

async function aMiniatura(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("no-decodable"));
      el.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("no-size");

    const side = LOGO_TARGET_SIDE_PX;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");

    // "contain": el logo entero, centrado, con padding transparente.
    const scale = Math.min(side / w, side / h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    ctx.drawImage(img, Math.round((side - dw) / 2), Math.round((side - dh) / 2), dw, dh);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("no-blob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PinPreview({ src, initial }: { src: string | null; initial: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0A2342] py-1.5 pl-1.5 pr-3 text-xs font-semibold text-white shadow">
      <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-[#C9A86A] text-[11px] font-bold text-[#0A2342]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      U$S 430 mil
    </div>
  );
}

export function AgencyLogoUploader({ slug, agencyName, currentLogoUrl, canEdit }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pending, setPending] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const initial = initialOf(agencyName);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setOk(null);
    setError(null);
    if (!file) return;
    try {
      const mini = await aMiniatura(file);
      if (preview) URL.revokeObjectURL(preview);
      setBlob(mini);
      setPreview(URL.createObjectURL(mini));
    } catch {
      setBlob(null);
      setPreview(null);
      setError("No se pudo procesar esa imagen. Probá con un PNG, JPG, WebP o SVG con tamaño definido.");
    }
  }

  async function onUpload() {
    if (!blob || pending) return;
    setPending(true);
    setOk(null);
    setError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("file", blob, "logo.png");
    const res = await uploadAgencyLogoAction(fd);
    setPending(false);
    if (!res.ok) {
      setError(describir(res));
      return;
    }
    setOk("Logo guardado. Ya se ve en el mapa.");
    setBlob(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function onRemove() {
    setConfirmRemove(false);
    if (pending) return;
    setPending(true);
    setOk(null);
    setError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    const res = await removeAgencyLogoAction(fd);
    setPending(false);
    if (!res.ok) {
      setError(describir(res));
      return;
    }
    setOk("Logo quitado. El pin vuelve a mostrar la inicial.");
    router.refresh();
  }

  const shown = preview ?? currentLogoUrl;

  return (
    <div className="space-y-4 rounded-lg border border-[#D8D8D8] bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D8D8D8] bg-slate-50">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={`Logo de ${agencyName}`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-3xl font-bold text-[#C9A86A]">{initial}</span>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-[#0A2342]">Así se ve en el pin</p>
          <div className="mt-2">
            <PinPreview src={shown} initial={initial} />
          </div>
          {preview && (
            <p className="mt-2 text-[11px] text-slate-500">Vista previa: todavía no está guardado.</p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="space-y-3 border-t border-[#D8D8D8] pt-4">
          <label className="block text-xs font-semibold text-[#0A2342]" htmlFor="ag-logo">
            Elegir imagen
          </label>
          <input
            id="ag-logo"
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={onFile}
            disabled={pending}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#0A2342] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onUpload}
              disabled={!blob || pending}
              className="inline-flex h-9 items-center rounded-md bg-[#0A2342] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#0A2342]/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Guardando…" : "Guardar logo"}
            </button>
            {currentLogoUrl && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border border-[#D8D8D8] px-4 text-xs font-semibold text-[#0A2342] transition-colors hover:bg-slate-50 disabled:opacity-40"
              >
                Quitar logo
              </button>
            )}
          </div>
        </div>
      )}

      {ok && <p className="text-xs text-emerald-700">{ok}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* S15-B: ninguna accion destructiva con dialogos nativos. */}
      <ConfirmDialog
        open={confirmRemove}
        title="Quitar el logo"
        message="Los pines del mapa van a mostrar la inicial de la agencia hasta que subas otro logo."
        confirmLabel="Quitar logo"
        tone="danger"
        onConfirm={onRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
