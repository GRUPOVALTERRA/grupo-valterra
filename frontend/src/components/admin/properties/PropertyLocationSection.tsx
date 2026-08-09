"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { GeoPoint, PublicLocationMode } from "@/lib/geo/types";
import { PUBLIC_RADIUS_MAX_M, PUBLIC_RADIUS_MIN_M } from "@/lib/geo/types";
import { resolvePublicLocation } from "@/lib/geo/public-location";
import type { PropertyAdminGeo } from "@/services/property-geo-admin";

/**
 * S18 PR2 — sección "Ubicación" del editor de propiedad.
 *
 * PublicLocationEditor (candidato reutilizable, NO extraído todavía).
 *
 * Reglas duras que implementa esta UI:
 *  - Cambiar el modo NUNCA copia la ubicación interna: la copia exige el
 *    botón explícito con advertencia de privacidad.
 *  - El centro visual inicial del mapa no se persiste: solo click/drag
 *    del operador emiten coordenadas.
 *  - La preview usa resolvePublicLocation (el MISMO CORE-GEO-01 que verá
 *    la capa pública) para evitar divergencias.
 */

// Leaflet no funciona en SSR: import dinámico obligatorio.
const GeoMapPicker = dynamic(() => import("@/components/admin/geo/GeoMapPicker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full items-center justify-center rounded-lg border border-[#D8D8D8] bg-slate-50 text-xs text-slate-400">
      Cargando mapa…
    </div>
  ),
});

/** Centro regional de cortesía (Corrientes Capital). Solo UX: NO se guarda. */
const FALLBACK_CENTER: GeoPoint = { latitude: -27.4692, longitude: -58.8306 };

const COPY_INTERNAL_WARNING =
  "Esta acción hará pública la ubicación exacta de esta propiedad.";

type Action = (formData: FormData) => Promise<{
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}>;

interface Props {
  action: Action;
  slug: string;
  initialGeo: PropertyAdminGeo;
  /** Rol sin permiso de edición (viewer): solo lectura. */
  canEdit: boolean;
}

const MODE_OPTIONS: { value: PublicLocationMode; label: string }[] = [
  { value: "hidden", label: "Oculta" },
  { value: "approximate", label: "Aproximada" },
  { value: "exact", label: "Exacta" },
];

function fmt(n: number | undefined | null): string {
  return n === null || n === undefined ? "" : String(n);
}

export function PropertyLocationSection({ action, slug, initialGeo, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [internal, setInternal] = useState<GeoPoint | null>(initialGeo.internal);
  const [mode, setMode] = useState<PublicLocationMode>(initialGeo.publicLocationMode);
  const [publicPoint, setPublicPoint] = useState<GeoPoint | null>(initialGeo.publicPoint);
  const [radius, setRadius] = useState<number>(initialGeo.publicRadiusM);

  // Inputs manuales (fallback de accesibilidad / precisión).
  const [latText, setLatText] = useState(fmt(initialGeo.internal?.latitude));
  const [lngText, setLngText] = useState(fmt(initialGeo.internal?.longitude));

  const setInternalBoth = (p: GeoPoint | null) => {
    setInternal(p);
    setLatText(fmt(p?.latitude));
    setLngText(fmt(p?.longitude));
  };

  const applyManual = () => {
    const la = Number(latText.replace(",", "."));
    const ln = Number(lngText.replace(",", "."));
    if (latText.trim() === "" && lngText.trim() === "") return setInternalBoth(null);
    if (Number.isFinite(la) && Number.isFinite(ln)) setInternalBoth({ latitude: la, longitude: ln });
  };

  /** Copia deliberada interna → pública. ÚNICO camino de copia. */
  const copyInternalToPublic = () => {
    if (!internal) return;
    if (!window.confirm(`${COPY_INTERNAL_WARNING}\n\n¿Continuar?`)) return;
    setPublicPoint({ ...internal });
  };

  // Preview: exactamente lo que recibiría la capa pública.
  const preview = useMemo(
    () =>
      resolvePublicLocation({
        public_location_mode: mode,
        public_latitude: publicPoint?.latitude ?? null,
        public_longitude: publicPoint?.longitude ?? null,
        public_radius_m: radius,
      }),
    [mode, publicPoint, radius],
  );

  const save = () => {
    setFeedback(null);
    setFieldErrors({});
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("lat", fmt(internal?.latitude));
    fd.set("lng", fmt(internal?.longitude));
    fd.set("public_location_mode", mode);
    fd.set("public_latitude", fmt(publicPoint?.latitude));
    fd.set("public_longitude", fmt(publicPoint?.longitude));
    fd.set("public_radius_m", String(radius));
    startTransition(async () => {
      const r = await action(fd);
      if (r.ok) {
        setFeedback({ kind: "ok", msg: "Ubicación guardada" });
        router.refresh();
      } else {
        setFeedback({ kind: "err", msg: r.error ?? "Error desconocido" });
        if (r.fieldErrors) setFieldErrors(r.fieldErrors);
      }
    });
  };

  const inputCls =
    "w-full rounded-md border border-[#D8D8D8] px-3 py-2 text-sm text-[#0A2342] focus:border-[#C9A84C] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
  const labelCls = "block text-xs font-medium text-[#4A5568]";

  return (
    <section className="mt-8 rounded-xl border border-[#D8D8D8] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#0A2342]">
        Ubicación
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        La ubicación interna es de uso administrativo. Lo que ve el público se controla aparte,
        en &ldquo;Visibilidad pública&rdquo;.
      </p>

      {/* ---------------- UBICACIÓN INTERNA ---------------- */}
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A86A]">
          Ubicación interna (exacta)
        </h3>
        <div className="mt-2 grid gap-4 lg:grid-cols-2">
          <div>
            <GeoMapPicker
              value={internal}
              onChange={canEdit ? setInternalBoth : undefined}
              fallbackCenter={FALLBACK_CENTER}
              interactive={canEdit}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Click en el mapa o arrastrá el pin. El centro inicial del mapa no se guarda.
            </p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="geo-lat">Latitud</label>
                <input
                  id="geo-lat"
                  className={inputCls}
                  value={latText}
                  onChange={(e) => setLatText(e.target.value)}
                  onBlur={applyManual}
                  placeholder="-27.469200"
                  inputMode="decimal"
                  disabled={!canEdit}
                />
                {fieldErrors.lat && <p className="mt-1 text-xs text-red-600">{fieldErrors.lat}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="geo-lng">Longitud</label>
                <input
                  id="geo-lng"
                  className={inputCls}
                  value={lngText}
                  onChange={(e) => setLngText(e.target.value)}
                  onBlur={applyManual}
                  placeholder="-58.830600"
                  inputMode="decimal"
                  disabled={!canEdit}
                />
                {fieldErrors.lng && <p className="mt-1 text-xs text-red-600">{fieldErrors.lng}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInternalBoth(null)}
              disabled={!canEdit || !internal}
              className="rounded-md border border-[#D8D8D8] px-3 py-1.5 text-xs font-medium text-[#4A5568] hover:bg-slate-50 disabled:opacity-40"
            >
              Limpiar ubicación
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- VISIBILIDAD PÚBLICA ---------------- */}
      <div className="mt-6 border-t border-[#EDEDED] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A86A]">
          Visibilidad pública
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={!canEdit}
              onClick={() => setMode(o.value)} /* cambiar modo NO copia coordenadas */
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                mode === o.value
                  ? "border-[#0A2342] bg-[#0A2342] text-white"
                  : "border-[#D8D8D8] text-[#4A5568] hover:bg-slate-50"
              } disabled:opacity-40`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {fieldErrors.public_location_mode && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.public_location_mode}</p>
        )}

        {mode === "hidden" && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            La ubicación no se mostrará públicamente.
          </p>
        )}

        {mode !== "hidden" && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <GeoMapPicker
                value={publicPoint}
                onChange={canEdit ? setPublicPoint : undefined}
                circleRadiusM={mode === "approximate" ? radius : undefined}
                fallbackCenter={internal ?? FALLBACK_CENTER}
                interactive={canEdit}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {mode === "approximate"
                  ? "El público verá el círculo, nunca un punto exacto."
                  : "El público verá este pin exacto."}
              </p>
            </div>
            <div className="space-y-3">
              <div className="text-xs text-slate-600">
                Centro público:{" "}
                {publicPoint
                  ? `${publicPoint.latitude.toFixed(6)}, ${publicPoint.longitude.toFixed(6)}`
                  : "sin definir"}
              </div>
              {(fieldErrors.public_latitude || fieldErrors.public_longitude) && (
                <p className="text-xs text-red-600">
                  {fieldErrors.public_latitude ?? fieldErrors.public_longitude}
                </p>
              )}
              {mode === "approximate" && (
                <div>
                  <label className={labelCls} htmlFor="geo-radius">
                    Radio del círculo (m) · {PUBLIC_RADIUS_MIN_M}–{PUBLIC_RADIUS_MAX_M}
                  </label>
                  <input
                    id="geo-radius"
                    type="number"
                    min={PUBLIC_RADIUS_MIN_M}
                    max={PUBLIC_RADIUS_MAX_M}
                    step={50}
                    className={inputCls}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    disabled={!canEdit}
                  />
                  {fieldErrors.public_radius_m && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.public_radius_m}</p>
                  )}
                </div>
              )}
              {/* HARDENING: la copia interna→pública SOLO existe en modo
                  Exacta. En Aproximada no hay camino UI hacia la interna:
                  el centro del círculo se elige deliberadamente aparte,
                  para que la coordenada exacta jamás viaje al navegador
                  público como centro. */}
              {mode === "exact" && (
                <>
                  <button
                    type="button"
                    onClick={copyInternalToPublic}
                    disabled={!canEdit || !internal}
                    className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
                    title={COPY_INTERNAL_WARNING}
                  >
                    Usar ubicación interna como ubicación pública
                  </button>
                  <p className="text-[11px] text-amber-700">{COPY_INTERNAL_WARNING}</p>
                </>
              )}
              {mode === "approximate" && (
                <p className="text-[11px] text-slate-500">
                  Elegí el centro del círculo a propósito: en modo Aproximada no se
                  puede copiar la ubicación interna exacta.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------------- PREVIEW PÚBLICA ---------------- */}
      <div className="mt-6 border-t border-[#EDEDED] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A86A]">
          Previsualización pública
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Resultado real de <code>resolvePublicLocation()</code> con lo cargado arriba:
        </p>
        <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-[#0A2342]">
          {preview.kind === "hidden" && "Sin ubicación pública (hidden)."}
          {preview.kind === "approximate" &&
            `Círculo aproximado · centro ${preview.center.latitude.toFixed(4)}, ${preview.center.longitude.toFixed(4)} · radio ${preview.radiusM} m`}
          {preview.kind === "exact" &&
            `Pin exacto en ${preview.point.latitude.toFixed(6)}, ${preview.point.longitude.toFixed(6)}`}
        </div>
        {mode !== "hidden" && preview.kind === "hidden" && (
          <p className="mt-1 text-xs text-amber-700">
            Falta el centro público: hasta definirlo, el público no verá ubicación (fail-closed).
          </p>
        )}
      </div>

      {/* ---------------- GUARDAR ---------------- */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || pending}
          className="rounded-md bg-[#0A2342] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1A3A6B] disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar ubicación"}
        </button>
        {feedback && (
          <span className={`text-xs ${feedback.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback.msg}
          </span>
        )}
        {!canEdit && (
          <span className="text-xs text-slate-400">Tu rol no puede editar la ubicación.</span>
        )}
      </div>
    </section>
  );
}
