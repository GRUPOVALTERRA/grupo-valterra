import type { Lead, LeadStatus, LeadSource } from "@/services/mock-leads";

/**
 * Tabla de leads.
 * Desktop: tabla densa con todas las columnas.
 * Mobile (<lg): cards apiladas.
 */

interface LeadTableProps {
  leads: Lead[];
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  scheduled: "Visita agendada",
  converted: "Convertido",
  lost: "Perdido",
  archived: "Archivado",
};

const STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-200",
  contacted: "bg-amber-50 text-amber-700 ring-amber-200",
  qualified: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  scheduled: "bg-purple-50 text-purple-700 ring-purple-200",
  converted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-red-50 text-red-700 ring-red-200",
  archived: "bg-slate-100 text-slate-600 ring-slate-200",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  "contact-form": "Form propiedad",
  whatsapp: "WhatsApp",
  phone: "Teléfono",
  email: "Email",
  referral: "Referido",
  social: "Redes",
  portal: "Portal externo",
};

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#F8F7F4] px-2.5 py-0.5 text-[11px] font-medium text-[#0A2342]">
      {SOURCE_LABEL[source]}
    </span>
  );
}

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace instantes";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function waLink(lead: Lead): string {
  const phone = lead.phone.replace(/\D/g, "");
  const msg = encodeURIComponent(
    `Hola ${lead.name.split(" ")[0]}, soy de Grupo Valterra. Recibimos tu consulta${
      lead.propertyTitle ? ` sobre "${lead.propertyTitle}"` : ""
    } y queríamos contactarte.`,
  );
  return `https://wa.me/${phone}?text=${msg}`;
}

function telLink(lead: Lead): string {
  return `tel:${lead.phone.replace(/\s/g, "")}`;
}

export function LeadTable({ leads }: LeadTableProps) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-[#D8D8D8] bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#D8D8D8] text-sm">
            <thead className="bg-[#F8F7F4]/60">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Agente</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D8D8]">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-[#F8F7F4]/40">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-[#0A2342]">{lead.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">{lead.id}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">{lead.phone}</td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {lead.email ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {lead.propertyTitle ? (
                      <span className="line-clamp-1 max-w-[220px] text-slate-800">
                        {lead.propertyTitle}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {lead.agentName ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <SourceBadge source={lead.source} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-slate-600">
                    {formatRelative(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={telLink(lead)}
                        title="Llamar"
                        aria-label={`Llamar a ${lead.name}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[#D8D8D8] px-2.5 text-xs font-medium text-[#0A2342] hover:bg-[#F8F7F4]"
                      >
                        📞 Llamar
                      </a>
                      <a
                        href={waLink(lead)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="WhatsApp"
                        aria-label={`WhatsApp a ${lead.name}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-[#25D366] px-2.5 text-xs font-semibold text-white hover:brightness-95"
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile */}
      <div className="space-y-3 lg:hidden">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="rounded-2xl border border-[#D8D8D8] bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[#0A2342]">{lead.name}</div>
                <div className="text-xs text-slate-500">{formatRelative(lead.createdAt)}</div>
              </div>
              <StatusBadge status={lead.status} />
            </div>

            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <div>📞 {lead.phone}</div>
              {lead.email && <div>✉️ {lead.email}</div>}
              {lead.propertyTitle && (
                <div className="line-clamp-1 text-slate-600">🏠 {lead.propertyTitle}</div>
              )}
              {lead.agentName && (
                <div className="text-xs text-slate-500">Agente: {lead.agentName}</div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SourceBadge source={lead.source} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#D8D8D8] pt-3">
              <a
                href={telLink(lead)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#D8D8D8] text-sm font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
              >
                📞 Llamar
              </a>
              <a
                href={waLink(lead)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-semibold text-white hover:brightness-95"
              >
                💬 WhatsApp
              </a>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
