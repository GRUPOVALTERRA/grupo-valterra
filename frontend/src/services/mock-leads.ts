import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";

export type LeadStatus =
  | "new" | "contacted" | "qualified" | "scheduled"
  | "converted" | "lost" | "archived";

export type LeadSource =
  | "contact-form" | "whatsapp" | "phone" | "email"
  | "referral" | "social" | "portal";

/**
 * Estado de entrega del aviso por correo (migración 0010, S16-LEAD-OBS).
 *
 * Tipo CERRADO a propósito: la bandeja decide colores, etiquetas y filtros a
 * partir de este valor, así que un `string` abierto dejaría entrar estados que
 * la UI no sabe representar. `toLeadNotifyStatus` normaliza cualquier valor
 * inesperado a `unknown` en vez de romper el panel.
 */
export const LEAD_NOTIFY_STATUSES = [
  "unknown",
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type LeadNotifyStatus = (typeof LEAD_NOTIFY_STATUSES)[number];

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  propertyTitle?: string;
  propertySlug?: string;
  agentName?: string;
  agencyId?: string;
  source: LeadSource;
  status: LeadStatus;
  message: string;
  createdAt: string;
  /* --- Estado del aviso por correo (S16-LEAD-OBS) --- */
  notifyStatus: LeadNotifyStatus;
  notifyAttempts: number;
  notifyLastAt?: string;
  notifyReason?: string;
  /** Identificador opaco del proveedor. NUNCA se muestra en la UI. */
  notifyMessageId?: string;
}

export interface NewLeadInput {
  name: string;
  phone: string;
  email?: string;
  message: string;
  propertyTitle?: string;
  propertySlug?: string;
  agentName?: string;
  agencyId?: string;
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
  agency_id: string | null;
  source: LeadSource;
  status: LeadStatus;
  /* --- migración 0010: estado del aviso --- */
  notify_status: string | null;
  notify_attempts: number | null;
  notify_last_at: string | null;
  notify_reason: string | null;
  notify_message_id: string | null;
}

/**
 * Normaliza el estado que viene de la base.
 *
 * La columna tiene un CHECK que sólo admite los cinco valores, pero el panel
 * no puede depender de eso: una fila anterior a la migración, una lectura
 * contra un esquema desactualizado o un valor futuro que este build todavía no
 * conoce llegarían como algo inesperado. En ese caso se representa como
 * `unknown` —información histórica neutral— y NUNCA como `sent`: dar por
 * avisado un lead que quizás no lo está es el único error caro de esta tabla.
 */
export function toLeadNotifyStatus(raw: unknown): LeadNotifyStatus {
  return typeof raw === "string" &&
    (LEAD_NOTIFY_STATUSES as readonly string[]).includes(raw)
    ? (raw as LeadNotifyStatus)
    : "unknown";
}

function rowToLead(row: LeadRow): Lead {
  const notifyStatus = toLeadNotifyStatus(row.notify_status);
  if (row.notify_status != null && notifyStatus === "unknown" && row.notify_status !== "unknown") {
    // Señal saneada: se registra que hubo un valor fuera de contrato, sin
    // volcar el valor crudo ni ningún dato del lead más allá de su id.
    log.warn("leads", "notify_status fuera de contrato; se trata como unknown", { leadId: row.id });
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    message: row.message,
    propertyTitle: row.property_title ?? undefined,
    propertySlug: row.property_slug ?? undefined,
    agentName: row.agent_name ?? undefined,
    agencyId: row.agency_id ?? undefined,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    notifyStatus,
    notifyAttempts: row.notify_attempts ?? 0,
    notifyLastAt: row.notify_last_at ?? undefined,
    notifyReason: row.notify_reason ?? undefined,
    notifyMessageId: row.notify_message_id ?? undefined,
  };
}

/* ---------- fallback memoria ---------- */

/**
 * Los seeds son de desarrollo local: nunca pasaron por el pipeline de aviso,
 * así que nacen `unknown` (sin evidencia) y no `pending`, que significaría que
 * hay un envío en curso esperando resultado.
 */
const SEED_LEADS: Lead[] = ([
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
] as Omit<Lead, "notifyStatus" | "notifyAttempts">[]).map((seed) => ({
  ...seed,
  notifyStatus: "unknown" as const,
  notifyAttempts: 0,
}));

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
      // S16-LEAD-OBS PR2: se agregan las cinco columnas de aviso; sin ellas el
      // panel no puede mostrar si el correo salió. La lista es explícita (no
      // `*`) para que agregar una columna a la tabla no filtre datos nuevos a
      // la UI sin decidirlo. Va en UN literal: partirla en concatenaciones le
      // saca a supabase-js el tipo literal y deja de inferir la forma de fila.
      .select(
        "id,created_at,name,phone,email,message,property_slug,property_title,agent_name,agency_id,source,status,notify_status,notify_attempts,notify_last_at,notify_reason,notify_message_id",
      )
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

/**
 * S16-LEAD-OBS PR3 — lectura puntual de un lead, con scope opcional de agencia.
 *
 * El scope lo resuelve el SERVIDOR (sesión), nunca el cliente. Para un actor
 * no super-admin la consulta pinea agency_id: un lead de otra agencia (o
 * inexistente) devuelve null indistinguible — no se filtra información.
 */
export async function getLeadById(
  id: string,
  scope: { agencyId?: string } = {},
): Promise<Lead | null> {
  if (!isSupabaseConfigured()) {
    warnMemoryMode();
    const found = MEMORY_STORE.find((l) => l.id === id) ?? null;
    if (!found) return null;
    if (scope.agencyId && found.agencyId !== scope.agencyId) return null;
    return found;
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("leads")
      // Mismo literal ÚNICO que getAllLeads (ver comentario allí): explícito
      // y sin concatenaciones para conservar la inferencia de fila.
      .select(
        "id,created_at,name,phone,email,message,property_slug,property_title,agent_name,agency_id,source,status,notify_status,notify_attempts,notify_last_at,notify_reason,notify_message_id",
      )
      .eq("id", id);

    if (scope.agencyId) {
      query = query.eq("agency_id", scope.agencyId);
    }

    const { data, error } = await withTimeout(query.maybeSingle(), 8000, "leads.selectById");

    if (error) {
      log.error("leads", "supabase selectById error", { message: error.message, code: error.code });
      throw new Error(`supabase selectById: ${error.message}`);
    }
    if (!data) return null;
    return rowToLead(data as LeadRow);
  } catch (err) {
    log.error("leads", "getLeadById falló", err instanceof Error ? err : { err: String(err) });
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
    agencyId: input.agencyId,
    source: input.source ?? "contact-form",
    status: "new",
    createdAt: now,
    // Un lead recién creado todavía no tiene resultado de aviso: el envío se
    // dispara después de responder (after()). `pending` es exactamente eso, y
    // es también el default de la columna en la migración 0010.
    notifyStatus: "pending",
    notifyAttempts: 0,
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
        agency_id: lead.agencyId ?? null,
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
