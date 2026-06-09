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
  const ctx = await getAdminContext();

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();

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

  // Invite owner automatically if email provided
  if (ownerEmail && result.id) {
    const origin = await originFromHeaders();
    const inviteResult = await inviteUserToAgency({
      email: ownerEmail,
      agencyId: result.id,
      agencyName: name,
      agencySlug: slug,
      role: "owner",
      inviterEmail: ctx.userEmail,
      origin,
    });

    if (!inviteResult.ok) {
      log.warn("admin/agencies", "agency creada pero invite owner fallo", {
        slug,
        ownerEmail,
        error: inviteResult.error,
      });
      redirect(`/admin/agencies/${slug}?invite_failed=1`);
    }

    log.info("admin/agencies", "owner invitado", {
      slug,
      ownerEmail,
      emailSent: inviteResult.emailSent,
    });
  }

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

/* ---------------------------------------------------------- */
/* Owner-scoped invite: solo el owner invita a SU agency      */
/* ---------------------------------------------------------- */
export async function ownerInviteMemberAction(
  formData: FormData,
): Promise<{ ok: true; emailSent: boolean; note?: string } | { ok: false; error: string }> {
  const ctx = await getAdminContext();

  if (!ctx.scopedAgencyId) {
    return { ok: false, error: "Sin agency asignada. Acceso denegado." };
  }

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );
  if (!isOwner) {
    return { ok: false, error: "Solo el owner puede invitar miembros." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "agent") as AgencyRole;

  if (!email) return { ok: false, error: "Email requerido" };
  if (!VALID_ROLES.has(role)) return { ok: false, error: "Rol invalido" };

  const origin = await originFromHeaders();

  const result = await inviteUserToAgency({
    email,
    agencyId: ctx.scopedAgencyId,
    agencyName: ctx.scopedAgencyName ?? "Agency",
    agencySlug: ctx.scopedAgencySlug ?? "",
    role,
    inviterEmail: ctx.userEmail,
    origin,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Invitacion fallo" };
  }

  if (ctx.scopedAgencySlug) revalidatePath(`/admin/agencies/${ctx.scopedAgencySlug}`);
  return {
    ok: true,
    emailSent: Boolean(result.emailSent),
    note: result.error,
  };
}
