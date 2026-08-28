"use client";

import { useMemo, useState } from "react";
import {
  SOCIAL_NETWORKS,
  buildUtmUrl,
  normalizeCampaign,
} from "@/lib/social-utm";

/**
 * Generador de enlaces etiquetados (S20-PR4).
 *
 * POR QUÉ EXISTE: Instagram y Facebook recortan el referrer en buena parte
 * del tráfico móvil. Sin UTM en la URL, esas visitas llegan como "directo"
 * y la pestaña de redes queda vacía por más que la publicación funcione.
 * Este generador es lo que hace que el reporte tenga datos.
 *
 * Todo ocurre en el navegador: no toca la base ni registra nada.
 */

export interface DestinoOption {
  /** Ruta interna con barra inicial. */
  path: string;
  label: string;
}

const COPY_OK_MS = 2000;

export function UtmBuilder({
  baseUrl,
  destinos,
}: {
  baseUrl: string;
  destinos: DestinoOption[];
}) {
  const [network, setNetwork] = useState(SOCIAL_NETWORKS[0].id);
  const [path, setPath] = useState(destinos[0]?.path ?? "/");
  const [campaign, setCampaign] = useState("");
  const [copiado, setCopiado] = useState(false);

  const url = useMemo(
    () => buildUtmUrl({ baseUrl, path, network, campaign }),
    [baseUrl, path, network, campaign],
  );

  const campaignSlug = normalizeCampaign(campaign);
  const campaignDistinta = campaignSlug && campaignSlug !== campaign.trim().toLowerCase();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), COPY_OK_MS);
    } catch {
      // Portapapeles bloqueado (permisos o contexto inseguro): el input es
      // seleccionable, así que el enlace sigue siendo copiable a mano.
      setCopiado(false);
    }
  }

  const labelCls = "block text-[10px] uppercase tracking-wide text-[#6B7280]";
  const inputCls =
    "mt-1 w-full rounded border border-[#D8D8D8] bg-white px-2 py-1.5 text-xs text-[#1F2937] outline-none focus:border-[#B08D4F]";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="utm-red">
            Red
          </label>
          <select
            id="utm-red"
            className={inputCls}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            {SOCIAL_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="utm-destino">
            Destino
          </label>
          <select
            id="utm-destino"
            className={inputCls}
            value={path}
            onChange={(e) => setPath(e.target.value)}
          >
            {destinos.map((d) => (
              <option key={d.path} value={d.path}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="utm-campana">
            Campaña (opcional)
          </label>
          <input
            id="utm-campana"
            className={inputCls}
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="ej. lanzamiento-camba-cua"
            maxLength={80}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="utm-resultado">
          Enlace para publicar
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="utm-resultado"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-[#D8D8D8] bg-[#FAF9F7] px-2 py-1.5 font-mono text-[11px] text-[#1F2937]"
          />
          <button
            type="button"
            onClick={copiar}
            className="shrink-0 rounded border border-[#B08D4F] px-3 py-1.5 text-xs font-medium text-[#B08D4F] transition-colors hover:bg-[#B08D4F] hover:text-white"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      {campaignDistinta ? (
        <p className="text-[11px] text-[#6B7280]">
          La campaña se normaliza a <span className="font-mono">{campaignSlug}</span> para que el
          mismo nombre no se cuente dos veces.
        </p>
      ) : null}
    </div>
  );
}
