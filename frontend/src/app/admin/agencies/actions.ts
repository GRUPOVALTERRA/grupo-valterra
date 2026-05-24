"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import { createAgency, getAgencyBySlug, type AgencyRole } from "@/services/agencies";
import { inviteUserToAgency } from "@/services/agency-invites";

/**
 * MF6 server actions - SOLO super-admin (guard explicito).
 */

const VALID_ROLES: ReadonlySet<AgencyRole> = new Set<AgencyRole>([
  "owner", "admin", "agent", "viewer",
]);

async function assertSuperAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin) {
    throw new Error("forbidden: super-admin only");
  }
}

async function originFromHeaders(): Promise<string> {
  const hdrs = await nextHeaders();
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("host") ?? "grupo-valterra.vercel.app";
  return `${proto}://${host}`;
}

export async function createAgencyAction(
  formData: FormData,
): Promise<{ ok: false; error: string } | void> {
  await assertSuperAdmin();

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();

  const result = await createAgency({
    slug,
    name,
    contact_email: contact_email || undefined,
    contact_phone: contact_phone || undefined,
    city: city || undefined,
    province: province || undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Error desconocido" };
  }

  log.info("admin/agencies", "agency creada", { slug, id: result.id });
  revalidatePath("/admin/agencies");
  redirect(`/admin/agencies/${slug}`);
}

export async function inviteMemberAction(
  formData: FormData,
): Promise<{ ok: true; emailSent: boolean; note?: string } | { ok: false; error: string }> {
  await assertSuperAdmin();
  const ctx = await getAdminContext();

  const agencySlug = String(formData.get("agencySlug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "agent") as AgencyRole;

  if (!agencySlug) return { ok: false, error: "agencySlug requerido" };
  if (!VALID_ROLES.has(role)) return { ok: false, error: "Rol invalido" };

  const agency = await getAgencyBySlug(agencySlug);
  if (!agency) return { ok: false, error: "Agency no encontrada" };

  const origin = await originFromHeaders();
  const result = await inviteUserToAgency({
    email,
    agencyId: agency.id,
    agencyName: agency.name,
    agencySlug: agency.slug,
    role,
    inviterEmail: ctx.userEmail,
    origin,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Invitacion fallo" };
  }

  revalidatePath(`/admin/agencies/${agencySlug}`);
  return {
    ok: true,
    emailSent: Boolean(result.emailSent),
    note: result.error,
  };
}
