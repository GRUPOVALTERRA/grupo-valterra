import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAnalyticsScope } from "@/lib/analytics-scope";
import {
  getAnalyticsSummary,
  getAnalyticsDaily,
  getAnalyticsProperties,
  getAnalyticsCampaigns,
  getAnalyticsWeb,
  pickDimension,
} from "@/services/site-events";
import {
  parsePeriod,
  periodRange,
  periodLabel,
  conversionRate,
  estimatedUniques,
  uniquesCoverage,
  formatCount,
  formatPercent,
  fillDailySeries,
  splitCampaigns,
  campaignLabel,
  sortProperties,
  propertyDisplayName,
  PERIODS,
  type Period,
} from "@/lib/analytics-metrics";
import {
  StatsTabs,
  KpiCard,
  SectionCard,
  EmptyState,
  DailyChart,
  BarList,
  ConversionTable,
  type ConversionRow,
  type TabDef,
} from "@/components/admin/estadisticas/StatsUI";

/**
 * VALTERRA DATA & ANALYTICS — tablero /admin/estadisticas (S20-PR3).
 *
 * Server component. Toda la agregación ocurre en PostgreSQL (migración
 * 0015); acá solo se decide el ámbito autorizado, se piden agregados y se
 * dibujan. Ninguna fila cruda de `site_events` llega al navegador.
 *
 * SEPARACIÓN DE ÁMBITOS — la decisión central de este tablero:
 * los eventos con `agency_id` (fichas de propiedad) y los de tráfico general
 * del portal (home, listado, footer) se muestran en bloques distintos y
 * JAMÁS se suman. Mezclarlos produciría una conversión falsa: el
 * denominador incluiría visitas que nunca vieron esa propiedad.
 */

export const dynamic = "force-dynamic";

const TABS: TabDef[] = [
  { id: "resumen", label: "Resumen", disponible: true },
  { id: "web", label: "Web", disponible: true },
  { id: "propiedades", label: "Propiedades", disponible: true },
  { id: "campanas", label: "Campañas", disponible: true },
  { id: "redes", label: "Redes sociales", disponible: false },
];

const SIN_DATOS_AUN = "El sistema de analítica acaba de entrar en producción: es normal ver poco o nada todavía.";

interface PageProps {
  searchParams: Promise<{ periodo?: string; ambito?: string; tab?: string }>;
}

export default async function EstadisticasPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // El ámbito se autoriza en el servidor. El parámetro de la URL es una
  // preferencia: para un miembro común se ignora (ver analytics-scope.ts).
  const resolved = await resolveAnalyticsScope(params.ambito);
  if (!resolved) redirect("/admin/login?next=/admin/estadisticas");

  const { scope, isGlobal, label, canSwitchScope } = resolved;
  const period: Period = parsePeriod(params.periodo);
  const range = periodRange(period);
  const tab = TABS.some((t) => t.id === params.tab && t.disponible) ? params.tab! : "resumen";

  const qs = (over: Partial<{ periodo: string; ambito: string; tab: string }>) => {
    const sp = new URLSearchParams();
    sp.set("periodo", over.periodo ?? period);
    sp.set("tab", over.tab ?? tab);
    const amb = over.ambito ?? (isGlobal ? "todas" : "");
    if (amb) sp.set("ambito", amb);
    return `/admin/estadisticas?${sp.toString()}`;
  };

  const [summary, daily, propiedades, campanas, web] = await Promise.all([
    getAnalyticsSummary(scope, range),
    getAnalyticsDaily(scope, range),
    tab === "propiedades" || tab === "resumen"
      ? getAnalyticsProperties(scope, range, 20)
      : Promise.resolve([]),
    tab === "campanas" ? getAnalyticsCampaigns(scope, range) : Promise.resolve([]),
    tab === "web" || tab === "resumen" ? getAnalyticsWeb(scope, range, 10) : Promise.resolve([]),
  ]);

  const ag = summary.agency;
  const gen = summary.general;
  const totalEventos = ag.pageviews + ag.waClicks + gen.pageviews + gen.waClicks;

  const unicos = estimatedUniques(ag);
  const cobertura = uniquesCoverage(ag);

  return (
    <main className="min-h-screen bg-[#F8F7F4] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Encabezado */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
              Valterra Data &amp; Analytics
            </p>
            <h1 className="text-xl font-semibold text-[#0A2342]">Estadísticas</h1>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              {label} · {periodLabel(period)}
            </p>
          </div>
          {/* Rediseño de navegación (27/08/2026): los accesos a Propiedades y
              Consultas que vivían acá pasaron al AdminHeader del layout. */}
        </header>

        {/* Controles */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] text-[#6B7280]">Período:</span>
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={qs({ periodo: p })}
                aria-current={p === period ? "true" : undefined}
                className={
                  p === period
                    ? "rounded-md bg-[#0A2342] px-2.5 py-1 text-[11px] font-semibold text-white"
                    : "rounded-md border border-[#D8D8D8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A5568] hover:bg-white"
                }
              >
                {p === "hoy" ? "Hoy" : `${p} días`}
              </Link>
            ))}
          </div>

          {canSwitchScope ? (
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[11px] text-[#6B7280]">Ámbito:</span>
              <Link
                href={qs({ ambito: "" })}
                className={
                  !isGlobal
                    ? "rounded-md bg-[#0A2342] px-2.5 py-1 text-[11px] font-semibold text-white"
                    : "rounded-md border border-[#D8D8D8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A5568]"
                }
              >
                Mi inmobiliaria
              </Link>
              <Link
                href={qs({ ambito: "todas" })}
                className={
                  isGlobal
                    ? "rounded-md bg-[#0A2342] px-2.5 py-1 text-[11px] font-semibold text-white"
                    : "rounded-md border border-[#D8D8D8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A5568]"
                }
              >
                Todas
              </Link>
            </div>
          ) : null}
        </div>

        <StatsTabs tabs={TABS} activa={tab} hrefFor={(id) => qs({ tab: id })} />

        <div className="mt-5 space-y-5">
          {totalEventos === 0 ? (
            <EmptyState titulo="Todavía no hay eventos en este período" detalle={SIN_DATOS_AUN} />
          ) : null}

          {/* ---------------- RESUMEN ---------------- */}
          {tab === "resumen" ? (
            <>
              <SectionCard
                titulo={isGlobal ? "Propiedades — todas las inmobiliarias" : "Propiedades de tu inmobiliaria"}
                descripcion="Visitas a fichas y consultas por WhatsApp. No incluye el tráfico general del portal."
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard emoji="👁️" label="Visitas a fichas" value={formatCount(ag.pageviews)} />
                  <KpiCard
                    emoji="🧭"
                    label="Visitantes únicos estimados"
                    value={formatCount(unicos)}
                    hint={
                      cobertura === null
                        ? "Sin visitas para estimar."
                        : `Estimación sobre el ${cobertura.toFixed(0)}% de visitas identificables del período.`
                    }
                  />
                  <KpiCard emoji="💬" label="Clicks WhatsApp" value={formatCount(ag.waClicks)} destacada />
                  <KpiCard
                    emoji="📈"
                    label="Conversión WA / visita"
                    value={formatPercent(conversionRate(ag.waClicks, ag.pageviews))}
                    hint="Sobre visitas a fichas únicamente."
                  />
                </div>
              </SectionCard>

              <SectionCard
                titulo="Sitio general — portal Valterra"
                descripcion="Home, listado y navegación no asociada a una propiedad. Se muestra por separado: sumarlo a lo anterior daría una conversión falsa."
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard emoji="🌐" label="Visitas al portal" value={formatCount(gen.pageviews)} />
                  <KpiCard
                    emoji="🧭"
                    label="Visitantes únicos estimados"
                    value={formatCount(estimatedUniques(gen))}
                  />
                  <KpiCard emoji="💬" label="WhatsApp generales" value={formatCount(gen.waClicks)} />
                  <KpiCard
                    emoji="📈"
                    label="Conversión del portal"
                    value={formatPercent(conversionRate(gen.waClicks, gen.pageviews))}
                  />
                </div>
              </SectionCard>

              <div className="grid gap-5 lg:grid-cols-2">
                <SectionCard
                  titulo="Evolución diaria"
                  descripcion="Tráfico observado · sitio general + ámbito seleccionado. Es VOLUMEN, no una métrica de conversión: este total nunca se usa como denominador. Día comercial argentino."
                >
                  <DailyChart
                    points={fillDailySeries(
                      mergeDaily(daily.agency, daily.general),
                      range.from,
                      range.to,
                    )}
                  />
                </SectionCard>
                <SectionCard titulo="Dónde se hace click a WhatsApp" descripcion="Superficies del sitio, ordenadas por cantidad de clicks.">
                  <BarList
                    items={pickDimension(web, "wa_source").map((r) => ({
                      label: r.label,
                      value: r.events,
                    }))}
                    vacio="Todavía no hay clicks de WhatsApp en el período."
                  />
                </SectionCard>
              </div>
            </>
          ) : null}

          {/* ---------------- WEB ---------------- */}
          {tab === "web" ? (
            <>
              <p className="rounded-md border border-[#E5E2DC] bg-white px-3 py-2 text-[11px] leading-relaxed text-[#6B7280]">
                <strong className="text-[#0A2342]">Contexto del sitio.</strong> Esta sección
                combina el tráfico del portal general con el de las fichas del ámbito que tenés
                habilitado — nunca incluye eventos de otra inmobiliaria. Es una lectura de cómo
                llega la gente al sitio, no una métrica de conversión de tu inmobiliaria.
              </p>
              <SectionCard
                titulo="Visitas por día"
                descripcion="Tráfico observado · sitio general + ámbito seleccionado. Día comercial argentino."
              >
                <DailyChart
                  points={fillDailySeries(mergeDaily(daily.agency, daily.general), range.from, range.to)}
                />
              </SectionCard>
              <div className="grid gap-5 lg:grid-cols-3">
                <SectionCard titulo="Páginas más vistas">
                  <BarList items={pickDimension(web, "path").map((r) => ({ label: r.label, value: r.events }))} />
                </SectionCard>
                <SectionCard titulo="De dónde llegan" descripcion="Host de origen, sin URL completa.">
                  <BarList
                    items={pickDimension(web, "referrer").map((r) => ({ label: r.label, value: r.events }))}
                    vacio="Sin referencias externas registradas."
                  />
                </SectionCard>
                <SectionCard titulo="Tipo de tráfico">
                  <BarList
                    items={pickDimension(web, "traffic_type").map((r) => ({
                      label: r.label === "campana" ? "Campaña" : r.label === "referral" ? "Referral" : "Directo",
                      value: r.events,
                    }))}
                  />
                </SectionCard>
              </div>
            </>
          ) : null}

          {/* ---------------- PROPIEDADES ---------------- */}
          {tab === "propiedades" ? (
            <SectionCard
              titulo="Ranking de propiedades"
              descripcion="Ordenado por consultas de WhatsApp y luego por visitas."
            >
              <ConversionTable
                colNombre="Propiedad"
                rows={sortProperties(propiedades).map<ConversionRow>((p) => ({
                  key: p.slug,
                  nombre: propertyDisplayName(p),
                  sub: p.slug,
                  pageviews: p.pageviews,
                  waClicks: p.waClicks,
                  conversion: conversionRate(p.waClicks, p.pageviews),
                }))}
                vacio={
                  <EmptyState
                    titulo="Sin actividad en fichas de propiedad"
                    detalle={SIN_DATOS_AUN}
                  />
                }
              />
            </SectionCard>
          ) : null}

          {/* ---------------- CAMPAÑAS ---------------- */}
          {tab === "campanas" ? (
            <CampaignsSection rows={campanas} />
          ) : null}

          {/* ---------------- REDES ---------------- */}
          {tab === "redes" ? (
            <EmptyState titulo="Disponible en próxima etapa" detalle="Las métricas de redes sociales llegan en la siguiente fase." />
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Suma las dos series diarias solo para el gráfico de volumen total. */
function mergeDaily(
  a: { day: string; pageviews: number; waClicks: number }[],
  b: { day: string; pageviews: number; waClicks: number }[],
) {
  const m = new Map<string, { day: string; pageviews: number; waClicks: number }>();
  for (const p of [...a, ...b]) {
    const prev = m.get(p.day) ?? { day: p.day, pageviews: 0, waClicks: 0 };
    m.set(p.day, {
      day: p.day,
      pageviews: prev.pageviews + p.pageviews,
      waClicks: prev.waClicks + p.waClicks,
    });
  }
  return [...m.values()].sort((x, y) => x.day.localeCompare(y.day));
}

function CampaignsSection({ rows }: { rows: Parameters<typeof splitCampaigns>[0] }) {
  const { tagged, untagged } = splitCampaigns(rows);
  return (
    <>
      <SectionCard
        titulo="Campañas etiquetadas"
        descripcion="Agrupadas por utm_source · utm_medium · utm_campaign."
      >
        <ConversionTable
          colNombre="Campaña"
          rows={tagged.map<ConversionRow>((c, i) => ({
            key: `${c.utmSource}|${c.utmMedium}|${c.utmCampaign}|${i}`,
            nombre: campaignLabel(c),
            pageviews: c.pageviews,
            waClicks: c.waClicks,
            conversion: conversionRate(c.waClicks, c.pageviews),
          }))}
          vacio={
            <EmptyState
              titulo="Todavía no hay campañas con UTM"
              detalle="Cuando publiques un enlace con utm_source, utm_medium y utm_campaign, su rendimiento aparece acá."
            />
          }
        />
      </SectionCard>

      <SectionCard
        titulo="Tráfico sin campaña"
        descripcion="Visitas sin parámetros UTM. Se muestra aparte para no competir con las campañas reales en el ranking."
      >
        {untagged ? (
          <ConversionTable
            colNombre="Origen"
            rows={[
              {
                key: "sin-campana",
                nombre: campaignLabel(untagged),
                pageviews: untagged.pageviews,
                waClicks: untagged.waClicks,
                conversion: conversionRate(untagged.waClicks, untagged.pageviews),
              },
            ]}
            vacio={null}
          />
        ) : (
          <p className="py-4 text-center text-xs text-[#9A9A9A]">Sin datos en el período</p>
        )}
      </SectionCard>
    </>
  );
}
