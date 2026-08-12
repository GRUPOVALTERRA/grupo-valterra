import Link from "next/link";
import {
  formatCount,
  formatPercent,
  type DailyPoint,
} from "@/lib/analytics-metrics";

/**
 * VALTERRA DATA & ANALYTICS — piezas visuales del tablero (S20-PR3).
 *
 * Server components puros: reciben números ya calculados y los dibujan.
 * Ninguna decisión de negocio vive acá — eso está en `analytics-metrics.ts`.
 *
 * Gráficos en SVG propio, sin librería: con 30 puntos diarios una barra y
 * una línea son treinta líneas de código, y evitamos sumar ~500 KB y un
 * peer-dependency de React al bundle del admin.
 *
 * Paleta Valterra: #0A2342 (azul noche) · #C9A86A (dorado).
 */

const AZUL = "#0A2342";
const DORADO = "#C9A86A";

// ============================================================
// Tabs
// ============================================================

export interface TabDef {
  id: string;
  label: string;
  disponible: boolean;
}

export function StatsTabs({
  tabs,
  activa,
  hrefFor,
}: {
  tabs: TabDef[];
  activa: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-[#E5E2DC]" aria-label="Secciones">
      {tabs.map((t) => {
        const esActiva = t.id === activa;
        const base =
          "relative -mb-px rounded-t-md px-3 py-2 text-xs font-semibold transition-colors";
        if (!t.disponible) {
          return (
            <span
              key={t.id}
              className={`${base} cursor-not-allowed text-[#9A9A9A]`}
              title="Disponible en próxima etapa"
            >
              {t.label}
            </span>
          );
        }
        return (
          <Link
            key={t.id}
            href={hrefFor(t.id)}
            aria-current={esActiva ? "page" : undefined}
            className={
              esActiva
                ? `${base} border-b-2 border-[${DORADO}] text-[#0A2342]`
                : `${base} text-[#4A5568] hover:text-[#0A2342]`
            }
            style={esActiva ? { borderBottom: `2px solid ${DORADO}`, color: AZUL } : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ============================================================
// KPI cards
// ============================================================

export function KpiCard({
  label,
  value,
  hint,
  emoji,
  destacada = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emoji: string;
  destacada?: boolean;
}) {
  return (
    <div
      className="rounded-lg border bg-white p-4 shadow-sm"
      style={{ borderColor: destacada ? DORADO : "#E5E2DC" }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
          {label}
        </span>
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: AZUL }}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">{hint}</p> : null}
    </div>
  );
}

// ============================================================
// Estados
// ============================================================

export function EmptyState({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#D8D8D8] bg-[#FAF9F7] px-6 py-10 text-center">
      <p className="text-sm font-semibold" style={{ color: AZUL }}>
        {titulo}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#6B7280]">{detalle}</p>
    </div>
  );
}

export function SectionCard({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#E5E2DC] bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: AZUL }}>
          {titulo}
        </h3>
        {descripcion ? (
          <p className="mt-0.5 text-[11px] text-[#6B7280]">{descripcion}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

// ============================================================
// Gráfico diario (SVG propio)
// ============================================================

export function DailyChart({ points }: { points: DailyPoint[] }) {
  if (!points.length) {
    return <EmptyState titulo="Sin actividad en el período" detalle="Cuando haya visitas, la curva aparece acá." />;
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.pageviews, p.waClicks)));
  const ancho = 100;
  const alto = 34;
  const paso = points.length > 1 ? ancho / (points.length - 1) : 0;
  const linea = (key: "pageviews" | "waClicks") =>
    points
      .map((p, i) => `${(i * paso).toFixed(2)},${(alto - (p[key] / max) * alto).toFixed(2)}`)
      .join(" ");

  const primero = points[0]?.day;
  const ultimo = points[points.length - 1]?.day;

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={`Evolución diaria: máximo ${max} eventos en un día`}
      >
        <line x1="0" y1={alto} x2={ancho} y2={alto} stroke="#E5E2DC" strokeWidth="0.4" />
        <polyline
          points={linea("pageviews")}
          fill="none"
          stroke={AZUL}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={linea("waClicks")}
          fill="none"
          stroke={DORADO}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[#6B7280]">
        <span>{primero}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ background: AZUL }} /> Visitas
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ background: DORADO }} /> WhatsApp
          </span>
        </span>
        <span>{ultimo}</span>
      </div>
    </div>
  );
}

// ============================================================
// Barras horizontales
// ============================================================

export function BarList({
  items,
  vacio = "Sin datos en el período",
}: {
  items: { label: string; value: number }[];
  vacio?: string;
}) {
  if (!items.length) {
    return <p className="py-4 text-center text-xs text-[#9A9A9A]">{vacio}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-[#374151]" title={i.label}>
              {i.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: AZUL }}>
              {formatCount(i.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-[#F0EEE9]">
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${(i.value / max) * 100}%`, background: AZUL }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// Tabla de conversión
// ============================================================

export interface ConversionRow {
  key: string;
  nombre: string;
  sub?: string;
  pageviews: number;
  waClicks: number;
  conversion: number | null;
}

export function ConversionTable({
  rows,
  colNombre,
  vacio,
}: {
  rows: ConversionRow[];
  colNombre: string;
  vacio: React.ReactNode;
}) {
  if (!rows.length) return <>{vacio}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-[#E5E2DC] text-left text-[10px] uppercase tracking-wide text-[#6B7280]">
            <th className="pb-2 font-medium">{colNombre}</th>
            <th className="pb-2 text-right font-medium">Visitas</th>
            <th className="pb-2 text-right font-medium">WhatsApp</th>
            <th className="pb-2 text-right font-medium">Conversión</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[#F0EEE9] last:border-0">
              <td className="py-2 pr-3">
                <span className="font-medium text-[#1F2937]">{r.nombre}</span>
                {r.sub ? <span className="block text-[10px] text-[#9A9A9A]">{r.sub}</span> : null}
              </td>
              <td className="py-2 text-right tabular-nums">{formatCount(r.pageviews)}</td>
              <td className="py-2 text-right tabular-nums font-semibold" style={{ color: AZUL }}>
                {formatCount(r.waClicks)}
              </td>
              <td className="py-2 text-right tabular-nums">{formatPercent(r.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
