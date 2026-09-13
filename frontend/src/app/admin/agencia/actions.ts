"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canManageAgencyLogo } from "@/lib/agency-logo";
import { getAgencyBySlug } from "@/services/agencies";
import { removeAgencyLogo, setAgencyLogo } from "@/services/agency-logo";

/**
 * S26-MAP-02 — server actions del logo miniatura de agencia.
 *
 * Contrato con el cliente: entran SOLO el slug de la agencia y el
 * archivo. Quien puede tocar que agencia se resuelve aca, con el mismo
 * criterio que la configuracion de agencia (super-admin, o owner/admin
 * de ESA agencia, leido de las memberships de la sesion). El navegador
 * nunca manda agency_id ni path.
 *
 * Salida: codigos cerrados. No viaja al cliente ningun mensaje de
 * Storage, path ni id interno.
 */

export type AgencyLogoActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "forbidden"
        | "not-found"
        | "invalid-input"
        | "rejected"
        | "rate-limited"
        | "unavailable"
        | "failed";
      /** Motivo saneado del rechazo (categoria, nunca contenido). */
      reason?: string;
    };

const UPLOAD_RATE = { limit: 10, windowMs: 10 * 60_000 };

type Scope =
  | { ok: true; agencyId: string; slug: string; actor: string | null }
  | { ok: false; code: "forbidden" | "not-found" | "invalid-input" };

async function resolveScope(rawSlug: unknown): Promise<Scope> {
  const slug = String(rawSlug ?? "").trim().toLowerCase();
  if (!slug) return { ok: false, code: "invalid-input" };

  const ctx = await getAdminContext();
  const agency = await getAgencyBySlug(slug);
  if (!agency) return { ok: false, code: "not-found" };

  const allowed =
    ctx.isSuperAdmin ||
    ctx.memberships.some((m) => m.agencyId === agency.id && canManageAgencyLogo(m.role));
  if (!allowed) {
    log.warn("admin/agency-logo", "acceso denegado", {
      slug,
      actorId: ctx.userId,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    return { ok: false, code: "forbidden" };
  }
  return {
    ok: true,
    agencyId: agency.id,
    slug: agency.slug,
    actor: ctx.userId ?? (ctx.isSuperAdmin ? "super-admin" : null),
  };
}

function refresh(slug: string): void {
  revalidatePath("/admin/agencia");
  revalidatePath(`/admin/agencies/${slug}`);
  // El logo se ve en el mapa y en la vista mapa del listado.
  revalidatePath("/mapa");
  revalidatePath("/propiedades");
}

export async function uploadAgencyLogoAction(
  formData: FormData,
): Promise<AgencyLogoActionResult> {
  const scope = await resolveScope(formData.get("slug"));
  if (!scope.ok) return { ok: false, code: scope.code };

  const hdrs = await nextHeaders();
  const rl = rateLimit(`agency-logo:${getClientIp(hdrs)}`, UPLOAD_RATE);
  if (!rl.allowed) return { ok: false, code: "rate-limited" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "invalid-input" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await setAgencyLogo({
    agencyId: scope.agencyId,
    bytes,
    declaredType: file.type || undefined,
    updatedBy: scope.actor,
  });

  if (!res.ok) {
    if (res.code === "rejected") {
      return { ok: false, code: "rejected", reason: typeof res.reason === "string" ? res.reason : undefined };
    }
    if (res.code === "unavailable") return { ok: false, code: "unavailable" };
    return { ok: false, code: "failed" };
  }

  refresh(scope.slug);
  return { ok: true };
}

export async function removeAgencyLogoAction(
  formData: FormData,
): Promise<AgencyLogoActionResult> {
  const scope = await resolveScope(formData.get("slug"));
  if (!scope.ok) return { ok: false, code: scope.code };

  const res = await removeAgencyLogo({ agencyId: scope.agencyId, updatedBy: scope.actor });
  if (!res.ok) return { ok: false, code: "failed" };

  refresh(scope.slug);
  return { ok: true };
}
