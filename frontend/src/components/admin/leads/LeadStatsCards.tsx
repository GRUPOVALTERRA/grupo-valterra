import type { LeadStats } from "@/services/mock-leads";

/**
 * KPI cards del panel de leads.
 * 6 métricas visibles + total.
 */

interface LeadStatsCardsProps {
  stats: LeadStats;
}

interface CardConfig {
  label: string;
  value: number;
  accent: string;
  iconBg: string;
  iconColor: string;
  emoji: string;
}

export function LeadStatsCards({ stats }: LeadStatsCardsProps) {
  const cards: CardConfig[] = [
    {
      label: "Total leads",
      value: stats.total,
      accent: "border-[#0A2342]",
      iconBg: "bg-[#0A2342]",
      iconColor: "text-[#C9A86A]",
      emoji: "📥",
    },
    {
      label: "Nuevos",
      value: stats.new,
      accent: "border-blue-200",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-700",
      emoji: "✨",
    },
    {
      label: "Contactados",
      value: stats.contacted,
      accent: "border-amber-200",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-700",
      emoji: "📞",
    },
    {
      label: "Visitas agendadas",
      value: stats.scheduled,
      accent: "border-purple-200",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-700",
      emoji: "📅",
    },
    {
      label: "Convertidos",
      value: stats.converted,
      accent: "border-emerald-200",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-700",
      emoji: "🏆",
    },
    {
      label: "Perdidos",
      value: stats.lost,
      accent: "border-red-200",
      iconBg: "bg-red-50",
      iconColor: "text-red-700",
      emoji: "❌",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {card.label}
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-md text-sm ${card.iconBg} ${card.iconColor}`}
              aria-hidden
            >
              {card.emoji}
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[#0A2342]">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
