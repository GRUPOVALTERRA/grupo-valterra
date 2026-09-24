"use server";

import { revalidatePath } from "next/cache";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import { addLead, updateLeadStatus } from "@/services/mock-leads";
import { getPropertyBySlug } from "@/services/properties";
import { getValterraAgencyId } from "@/services/agencies";
import { validateIntake, isLeadStatus, type IntakeError } from "@/lib/lead-intake";

/**
 * S28 PR-A — server actions del intake manual de consultas y del cambio de
 * estado. Viven en un archivo propio, separado de `actions.ts`, porque las
 * guardas del reintento (S16 PR3) auditan ese archivo entero con un contrato
 * más estricto (sin eco de ids, sin campos de lead en logs). Acá el contrato
 * es: entra FormData / (id, estado); sale un código cerrado + el id creado
 * (no es PII); nunca viajan datos del lead ni errores internos al cliente.
 */

const LEAD_ID_MAX = 64;
const LEAD_ID_SHAPE = /^[A-Za-z0-9-]+$/;

// ============================================================
// S28 PR-A — intake manual de consultas + cambio de estado
// ============================================================

/**
 * Roles que pueden cargar una consulta o mover su estado: quien opera la
 * bandeja (owner/admin/agent). `viewer` mira, no escribe. Super-admin siempre.
 */
const WRITE_ROLES = new Set(["owner", "admin", "agent"]);

async function resolveWriter(): Promise<
  | { ok: true; agencyId: string | null; isSuperAdmin: boolean; userId: string | null }
  | { ok: false }
> {
  const ctx = await getAdminContext();
  if (ctx.isSuperAdmin) {
    // Sin agencia en scope, la consulta cae en la agencia canónica de Valterra.
    const agencyId = ctx.scopedAgencyId ?? (await getValterraAgencyId());
    return { ok: true, agencyId, isSuperAdmin: true, userId: ctx.userId };
  }
  if (!ctx.userId || !ctx.scopedAgencyId) return { ok: false };
  const role = ctx.memberships.find((m) => m.agencyId === ctx.scopedAgencyId)?.role;
  if (!role || !WRITE_ROLES.has(role)) return { ok: false };
  return { ok: true, agencyId: ctx.scopedAgencyId, isSuperAdmin: false, userId: ctx.userId };
}

export type CreateLeadResult =
  | { result: "created"; leadId: string }
  | { result: "forbidden" }
  | { result: "invalid"; error: IntakeError }
  | { result: "error" };

/**
 * Alta rápida de una consulta recibida por WhatsApp (o teléfono/redes).
 * Entra un FormData del cliente; todo se revalida acá. La agencia NUNCA
 * viene del cliente: sale de la sesión. La propiedad, si viene, tiene que
 * existir y pertenecer a esa agencia (o ser de cualquier agencia para
 * super-admin); si no, se guarda como consulta general.
 */
export async function createWhatsappLeadAction(formData: FormData): Promise<CreateLeadResult> {
  const who = await resolveWriter();
  if (!who.ok) return { result: "forbidden" };

  const v = validateIntake({
    name: formData.get("name"),
    phone: formData.get("phone"),
    propertySlug: formData.get("propertySlug"),
    source: formData.get("source"),
    campaignRef: formData.get("campaignRef"),
    note: formData.get("note"),
  });
  if (!v.ok) return { result: "invalid", error: v.error };

  let propertySlug: string | undefined;
  let propertyTitle: string | undefined;
  if (v.data.propertySlug) {
    try {
      const p = await getPropertyBySlug(v.data.propertySlug, { includeDraft: true });
      const sameAgency = p && (who.isSuperAdmin || !who.agencyId || p.agencyId === who.agencyId);
      if (p && sameAgency) {
        propertySlug = p.slug;
        propertyTitle = p.title;
      }
      // Propiedad inexistente o de otra agencia: se registra igual, sin propiedad.
    } catch {
      // La consulta vale más que el vínculo: se sigue sin propiedad.
    }
  }

  try {
    const lead = await addLead({
      name: v.data.name,
      phone: v.data.phone.stored,
      message: v.data.message,
      propertySlug,
      propertyTitle,
      agencyId: who.agencyId ?? undefined,
      source: v.data.source,
    });
    log.info("admin/leads", "consulta cargada a mano", {
      leadId: lead.id,
      agencyId: who.agencyId,
      actorId: who.userId,
      source: v.data.source,
      campaignRef: v.data.campaignRef,
      hasProperty: Boolean(propertySlug),
      numberCanonical: v.data.phone.canonical,
    });
    revalidatePath("/admin/leads");
    return { result: "created", leadId: lead.id };
  } catch (err) {
    log.error("admin/leads", "alta manual falló", err instanceof Error ? err : { err: String(err) });
    return { result: "error" };
  }
}

export type UpdateStatusResult = "updated" | "forbidden" | "invalid" | "not-found" | "error";

/** Cambia el estado comercial de un lead del scope. Entra id + estado; sale un código. */
export async function updateLeadStatusAction(
  leadIdRaw: unknown,
  statusRaw: unknown,
): Promise<{ result: UpdateStatusResult }> {
  const leadId =
    typeof leadIdRaw === "string" &&
    leadIdRaw.length > 0 &&
    leadIdRaw.length <= LEAD_ID_MAX &&
    LEAD_ID_SHAPE.test(leadIdRaw)
      ? leadIdRaw
      : null;
  if (!leadId) return { result: "not-found" };
  if (!isLeadStatus(statusRaw)) return { result: "invalid" };

  const who = await resolveWriter();
  if (!who.ok) return { result: "forbidden" };

  try {
    const updated = await updateLeadStatus(
      leadId,
      statusRaw,
      who.isSuperAdmin ? {} : { agencyId: who.agencyId ?? undefined },
    );
    if (!updated) return { result: "not-found" };
    log.info("admin/leads", "estado cambiado", {
      leadId,
      agencyId: updated.agencyId ?? null,
      actorId: who.userId,
      status: statusRaw,
    });
    revalidatePath("/admin/leads");
    return { result: "updated" };
  } catch (err) {
    log.error("admin/leads", "cambio de estado falló", err instanceof Error ? err : { err: String(err) });
    return { result: "error" };
  }
}
