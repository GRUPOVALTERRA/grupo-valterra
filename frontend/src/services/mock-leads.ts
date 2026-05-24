import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";

export type LeadStatus =
  | "new" | "contacted" | "qualified" | "scheduled"
  | "converted" | "lost" | "archived";

export type LeadSource =
  | "contact-form" | "whatsapp" | "phone" | "email"
  | "referral" | "social" | "portal";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  propertyTitle?: string;
  propertySlug?: string;
  agentName?: string;
  source: LeadSource;
  status: LeadStatus;
  message: string;
  createdAt: string;
}

export interface NewLeadInput {
  name: string;
  phone: string;
  email?: string;
  message: string;
  propertyTitle?: string;
  propertySlug?: string;
  agentName?: string;
  source?: LeadSource;
}

export interface LeadStats {
  total: number; new: number; contacted: number; qualified: number;
  scheduled: number; converted: number; lost: number; archived: number;
}

function generateLeadId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LEAD-${date}-${random}`;
}

interface LeadRow {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  property_slug: string | null;
  property_title: string | null;
  agent_name: string | null;
  source: LeadSource;
  status: LeadStatus;
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    message: row.message,
    propertyTitle: row.property_title ?? undefined,
    propertySlug: row.property_slug ?? undefined,
    agentName: row.agent_name ?? undefined,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
  };
}

/* ---------- fallback memoria ---------- */

const SEED_LEADS: Lead[] = [
  {
    id: "LEAD-SEED-A3F2C9", name: "Juan Pérez", phone: "+54 9 343 511-2233",
    email: "juan.perez@gmail.com",
    propertyTitle: "Casa premium frente al río Paraná",
    propertySlug: "casa-frente-al-rio-parana",
    agentName: "Lucía Bertotti", source: "contact-form", status: "new",
    message: "Me interesa la propiedad. ¿Cuándo puedo visitarla?",
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "LEAD-SEED-B4D8E1", name: "María González", phone: "+54 9 343 622-1144",
    email: "maria.g@hotmail.com",
    propertyTitle: "Departamento moderno en pleno centro",
    propertySlug: "departamento-moderno-centro-parana",
    agentName: "Mariano Esquivel", source: "contact-form", status: "contacted",
    message: "Quiero coordinar una visita el sábado.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "LEAD-SEED-C5F0A2", name: "Carlos Ramírez", phone: "+54 9 343 711-9988",
    propertyTitle: "Casa quinta en Villa Urquiza",
    propertySlug: "casa-quinta-villa-urquiza",
    agentName: "Carolina Méndez", source: "whatsapp", status: "qualified",
    message: "Tenemos crédito aprobado. Estamos listos para ver.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: "LEAD-SEED-D1A4B7", name: "Ana Torres", phone: "+54 9 343 555-3322",
    email: "ana.torres@yahoo.com",
    propertyTitle: "Loft de diseño en Colón",
    propertySlug: "loft-alquiler-temporal-colon",
    agentName: "Lucía Bertotti", source: "contact-form", status: "scheduled",
    message: "Confirmo visita martes 17/05 a las 16hs.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: "LEAD-SEED-F9B5C3", name: "Valentina Ríos", phone: "+54 9 343 222-1199",
    email: "val.rios@outlook.com",
    propertyTitle: "Departamento 2 amb. Santa Fe",
    propertySlug: "departamento-2-amb-santa-fe-capital",
    agentName: "Carolina Méndez", source: "referral", status: "converted",
    message: "Boleto firmado. ¡Gracias!",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 52).toISOString(),
  },
  {
    id: "LEAD-SEED-H4A1B9", name: "Sofía Domínguez", phone: "+54 9 343 770-4455",
    propertyTitle: "Casa familiar Concepción del Uruguay",
    propertySlug: "casa-familiar-concepcion-uruguay",
    agentName: "Lucía Bertotti", source: "social", status: "lost",
    message: "Encontré otra propiedad. Gracias por la atención.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 78).toISOString(),
  },
];

const MEMORY_STORE: Lead[] = [...SEED_LEADS];

function memorySnapshot(): Lead[] {
  return [...MEMORY_STORE].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

let warnedMemoryMode = false;
function warnMemoryMode() {
  if (warnedMemoryMode) return;
  warnedMemoryMode = true;
  log.warn("leads", "Supabase NO configurado - usando memory store (no persistente)");
}

/* ---------- API pública ---------- */

export interface LeadFilters {
  /** Sprint 10 MF4: scoping per-agency. Si undefined -> sin filtro (super-admin Valterra puede usarlo asi). */
  agencyId?: string;
}

export async function getAllLeads(filters: LeadFilters = {}): Promise<Lead[]> {
  if (!isSupabaseConfigured()) {
    warnMemoryMode();
    // En modo memoria los seeds no tienen agency_id - no scopeamos.
    // OK: memory mode es solo dev local; en prod siempre va por Supabase.
    return memorySnapshot();
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("leads")
      .select("id,created_at,name,phone,email,message,property_slug,property_title,agent_name,source,status")
      .order("created_at", { ascending: false });

    if (filters.agencyId) {
      query = query.eq("agency_id", filters.agencyId);
    }

    const { data, error } = await withTimeout(query, 8000, "leads.select");

    if (error) {
      log.error("leads", "supabase select error", { message: error.message, code: error.code });
      throw new Error(`supabase select: ${error.message}`);
    }
    return (data as LeadRow[] | null ?? []).map(rowToLead);
  } catch (err) {
    log.error("leads", "getAllLeads falló", err instanceof Error ? err : { err: String(err) });
    throw err;
  }
}

export async function addLead(input: NewLeadInput): Promise<Lead> {
  const id = generateLeadId();
  const now = new Date().toISOString();
  const lead: Lead = {
    id,
    name: input.name,
    phone: input.phone,
    email: input.email && input.email.length > 0 ? input.email : undefined,
    message: input.message,
    propertyTitle: input.propertyTitle,
    propertySlug: input.propertySlug,
    agentName: input.agentName,
    source: input.source ?? "contact-form",
    status: "new",
    createdAt: now,
  };

  if (!isSupabaseConfigured()) {
    warnMemoryMode();
    MEMORY_STORE.unshift(lead);
    log.info("leads", "lead añadido (memory)", { id: lead.id });
    return lead;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("leads").insert({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? null,
        message: lead.message,
        property_slug: lead.propertySlug ?? null,
        property_title: lead.propertyTitle ?? null,
        agent_name: lead.agentName ?? null,
        source: lead.source,
        status: lead.status,
      }).select().single(),
      8000,
      "leads.insert",
    );

    if (error) {
      log.error("leads", "supabase insert error", { message: error.message, code: error.code });
      throw new Error(`supabase insert: ${error.message}`);
    }

    log.info("leads", "lead persistido", { id: data.id });
    return rowToLead(data as LeadRow);
  } catch (err) {
    log.error("leads", "addLead falló", err instanceof Error ? err : { err: String(err) });
    throw err;
  }
}

export function computeStats(leads: Lead[]): LeadStats {
  const stats: LeadStats = {
    total: leads.length,
    new: 0, contacted: 0, qualified: 0, scheduled: 0,
    converted: 0, lost: 0, archived: 0,
  };
  for (const l of leads) stats[l.status] += 1;
  return stats;
}
