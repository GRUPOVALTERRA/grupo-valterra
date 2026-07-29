"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { log } from "@/lib/logger";
import { getAdminContext } from "@/lib/admin-context";
import {
  createAgency,
  getAgencyBySlug,
  getAgencyMember,
  updateMemberRole,
  removeAgencyMember,
  countAgencyOwners,
  type AgencyRole,
} from "@/services/agencies";
import {
  createAgencyInviteIssuer,
  createDefaultIssuerDeps,
  type InviteEmailPayload,
  type IssueInviteOutcome,
  type IssuerActor,
} from "@/services/agency-invites-issuer";

/**
 * MF6 server actions - SOLO super-admin (guard explicito).
 *
 * Sprint 13 · C2D4 — CUTOVER: las tres emisiones de invitacion pasan del
 * emisor viejo (`services/agency-invites.ts`, estrategia user_metadata) al
 * EMISOR NUEVO (`services/agency-invites-issuer.ts`), donde la fila de
 * public.agency_invites es la fuente de verdad y el link propio lleva solo
 * token_hash + type + invite_id + next interno.
 *
 * El emisor viejo sigue presente y sin tocar: el rollback es revertir este
 * unico commit.
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

/**
 * Origin canonico del sitio, fijado por configuracion SERVER-SIDE.
 *
 * Reemplaza al viejo `originFromHeaders()`, que derivaba el origin del header
 * `Host` del request (controlable por el cliente). El issuer usa este valor
 * para construir el link de /auth/confirm y para sanitizar `next`, asi que
 * nunca debe venir de datos del request.
 */
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://grupo-valterra.vercel.app";
}

/* ---------------------------------------------------------- */
/* Email de invitacion (Resend) — template y remitente actuales */
/* ---------------------------------------------------------- */

interface InviteEmailContext {
  agencySlug: string;
  role: AgencyRole;
}

/**
 * Fabrica el `sendEmail` que consume el issuer. El rol y el slug no viajan en
 * `InviteEmailPayload` (el payload no lleva datos de autorizacion), asi que se
 * cierran sobre el contexto de la accion, que ya los resolvio server-side.
 *
 * Usa como Idempotency-Key la clave que emite el issuer: distinta en CADA
 * emision/reenvio, de modo que un reenvio legitimo nunca queda deduplicado.
 */
function buildInviteEmailSender(ctx: InviteEmailContext) {
  return async function sendInviteEmail(
    payload: InviteEmailPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      log.warn("invites", "RESEND_API_KEY ausente · invitacion creada pero email NO enviado", {
        agencySlug: ctx.agencySlug,
      });
      return { ok: false, error: "RESEND_API_KEY no configurado" };
    }

    const sender = process.env.RESEND_SENDER ?? "Grupo Valterra <onboarding@resend.dev>";

    try {
      const resend = new Resend(resendKey);
      const { error } = await resend.emails.send({
        from: sender,
        to: [payload.to],
        subject: `Invitacion a ${payload.agencyName} - Grupo Valterra`,
        html: renderInviteHtml(payload, ctx),
        text: renderInviteText(payload, ctx),
        headers: { "Idempotency-Key": payload.idempotencyKey },
        tags: [
          { name: "type", value: "agency_invite" },
          { name: "agency", value: ctx.agencySlug },
        ],
      });
      if (error) {
        log.error("invites", "Resend error", { message: error.message });
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      log.error(
        "invites",
        "resend exception",
        err instanceof Error ? { message: err.message } : { err: String(err) },
      );
      return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
    }
  };
}

const NAVY = "#0A2342";
const GOLD = "#C9A86A";
const IVORY = "#F8F7F4";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderInviteHtml(p: InviteEmailPayload, ctx: InviteEmailContext): string {
  return `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1a202c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px -16px rgba(10,35,66,0.18);">
  <tr><td style="background:${NAVY};padding:24px 28px;color:#fff;">
    <table role="presentation" width="100%"><tr>
      <td><span style="display:inline-block;background:${GOLD};color:${NAVY};font-weight:800;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;font-size:15px;">VT</span></td>
      <td style="padding-left:12px;">
        <div style="font-weight:800;letter-spacing:0.06em;font-size:14px;">GRUPO VALTERRA</div>
        <div style="font-size:9px;letter-spacing:0.22em;color:${GOLD};text-transform:uppercase;margin-top:2px;">Soluciones Inmobiliarias del Litoral</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px;">
    <div style="display:inline-block;background:rgba(201,168,106,0.12);color:${GOLD};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Invitacion</div>
    <h1 style="margin:14px 0 6px 0;font-size:22px;color:${NAVY};font-weight:800;">Te invitan a unirte a ${escapeHtml(p.agencyName)}</h1>
    <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#4A5568;">
      ${p.invitedByEmail ? `${escapeHtml(p.invitedByEmail)} te invito a colaborar como <b>${escapeHtml(ctx.role)}</b> en la plataforma de Grupo Valterra.` : `Recibiste una invitacion para colaborar como <b>${escapeHtml(ctx.role)}</b>.`}
    </p>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#4A5568;">
      Confirma tu acceso con el siguiente boton. El link es de un solo uso.
    </p>
    <p style="margin:24px 0;">
      <a href="${p.link}" style="display:inline-block;background:${NAVY};color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;">Aceptar invitacion</a>
    </p>
    <p style="margin:0;font-size:12px;color:#94A3B8;word-break:break-all;">
      Si el boton no funciona, copia este link: ${escapeHtml(p.link)}
    </p>
  </td></tr>
  <tr><td style="background:${NAVY};color:#fff;padding:18px 32px;font-size:11px;">
    <span style="opacity:0.7;">Sprint 10 MF6 - onboarding multi-tenant</span>
    <span style="color:${GOLD};float:right;letter-spacing:0.14em;text-transform:uppercase;font-size:10px;">${escapeHtml(ctx.agencySlug)}</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderInviteText(p: InviteEmailPayload, ctx: InviteEmailContext): string {
  return [
    `GRUPO VALTERRA - Invitacion a ${p.agencyName}`,
    ``,
    p.invitedByEmail
      ? `${p.invitedByEmail} te invito como ${ctx.role} en la plataforma.`
      : `Recibiste una invitacion como ${ctx.role}.`,
    ``,
    `Aceptar (link de un solo uso):`,
    p.link,
    ``,
    `--`,
    `Soluciones Inmobiliarias del Litoral`,
  ].join("\n");
}

/* ---------------------------------------------------------- */
/* Emision de invitaciones via el issuer nuevo                */
/* ---------------------------------------------------------- */

async function issueInvite(args: {
  actor: IssuerActor;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  email: string;
  role: AgencyRole;
}): Promise<IssueInviteOutcome> {
  const deps = await createDefaultIssuerDeps({
    allowedOrigin: siteOrigin(),
    sendEmail: buildInviteEmailSender({ agencySlug: args.agencySlug, role: args.role }),
  });
  return createAgencyInviteIssuer(deps).issueAgencyInvite(args.actor, {
    agencyId: args.agencyId,
    agencyName: args.agencyName,
    email: args.email,
    role: args.role,
  });
}

type InviteActionResult =
  | { ok: true; emailSent: boolean; note?: string }
  | { ok: false; error: string };

/**
 * Traduce el resultado tipado del issuer a la MISMA forma de retorno que ya
 * consumia el panel. No se agregan campos ni se cambian los contratos de
 * formulario: solo cambia la fuente del resultado.
 */
function mapInviteOutcome(outcome: IssueInviteOutcome): InviteActionResult {
  switch (outcome.status) {
    case "sent":
    case "resent":
      return { ok: true, emailSent: true };
    case "invite_created_email_failed":
      return {
        ok: true,
        emailSent: false,
        note: "Invitacion creada pero el email no pudo enviarse. Podes reenviarla.",
      };
    case "already_member":
      return { ok: false, error: "Ese email ya es miembro de la agencia." };
    case "member_with_different_role":
      return { ok: false, error: "Ese email ya es miembro de la agencia con otro rol." };
    case "forbidden":
      return { ok: false, error: "Sin permisos para invitar con ese rol." };
    case "invalid_input":
      return { ok: false, error: `Dato invalido: ${outcome.field}` };
    case "agency_not_found":
    case "provider_error":
    case "internal_error":
    default:
      return { ok: false, error: "Invitacion fallo" };
  }
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
    const outcome = await issueInvite({
      actor: {
        userId: ctx.userId ?? "",
        email: ctx.userEmail,
        roleInAgency: "super_admin",
      },
      agencyId: result.id,
      agencyName: name,
      agencySlug: slug,
      email: ownerEmail,
      role: "owner",
    });
    const inviteResult = mapInviteOutcome(outcome);

    if (!inviteResult.ok) {
      log.warn("admin/agencies", "agency creada pero invite owner fallo", {
        slug,
        ownerEmail,
        error: inviteResult.error,
        status: outcome.status,
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

  const outcome = await issueInvite({
    actor: {
      userId: ctx.userId ?? "",
      email: ctx.userEmail,
      roleInAgency: "super_admin",
    },
    agencyId: agency.id,
    agencyName: agency.name,
    agencySlug: agency.slug,
    email,
    role,
  });
  const result = mapInviteOutcome(outcome);

  if (!result.ok) return result;

  revalidatePath(`/admin/agencies/${agencySlug}`);
  return result;
}

/* ---------------------------------------------------------- */
/* Owner member management: update role                       */
/* ---------------------------------------------------------- */
export async function updateMemberRoleAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();

  if (!ctx.scopedAgencyId) return { ok: false, error: "Sin agency asignada." };

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );
  if (!isOwner) return { ok: false, error: "Solo el owner puede cambiar roles." };

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const role = String(formData.get("role") ?? "") as AgencyRole;

  if (!targetUserId) return { ok: false, error: "userId requerido" };
  if (!VALID_ROLES.has(role)) return { ok: false, error: "Rol invalido" };

  const targetMember = await getAgencyMember(ctx.scopedAgencyId, targetUserId);
  if (!targetMember) return { ok: false, error: "Miembro no encontrado" };

  // Bloquear solo si el target ES owner y lo degradamos siendo el último
  if (targetMember.role === "owner" && role !== "owner") {
    const currentOwners = await countAgencyOwners(ctx.scopedAgencyId);
    if (currentOwners <= 1) {
      return { ok: false, error: "No se puede degradar al único owner de la agency." };
    }
  }

  const result = await updateMemberRole(ctx.scopedAgencyId, targetUserId, role);
  if (!result.ok) return { ok: false, error: result.error ?? "Error actualizando rol" };

  revalidatePath("/admin/leads");
  return { ok: true };
}

/* ---------------------------------------------------------- */
/* Owner member management: remove member                     */
/* ---------------------------------------------------------- */
export async function removeMemberAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();

  if (!ctx.scopedAgencyId) return { ok: false, error: "Sin agency asignada." };

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );
  if (!isOwner) return { ok: false, error: "Solo el owner puede remover miembros." };

  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId) return { ok: false, error: "userId requerido" };

  // No permitir auto-remocion
  if (ctx.userId && targetUserId === ctx.userId) {
    return { ok: false, error: "No puedes removerte a ti mismo." };
  }

  const targetMember = await getAgencyMember(ctx.scopedAgencyId, targetUserId);
  if (!targetMember) return { ok: false, error: "Miembro no encontrado" };

  // Bloquear solo si el target ES owner y es el último
  if (targetMember.role === "owner") {
    const currentOwners = await countAgencyOwners(ctx.scopedAgencyId);
    if (currentOwners <= 1) {
      return { ok: false, error: "No se puede remover al único owner de la agency." };
    }
  }

  const result = await removeAgencyMember(ctx.scopedAgencyId, targetUserId);
  if (!result.ok) return { ok: false, error: result.error ?? "Error removiendo member" };

  revalidatePath("/admin/leads");
  return { ok: true };
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

  // Rol REAL del actor en la agencia scoped, resuelto server-side. Nunca del
  // formulario: es el mismo dato con el que se autoriza la accion.
  const membership = ctx.memberships.find((m) => m.agencyId === ctx.scopedAgencyId);
  if (membership?.role !== "owner") {
    return { ok: false, error: "Solo el owner puede invitar miembros." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "agent") as AgencyRole;

  if (!email) return { ok: false, error: "Email requerido" };
  if (!VALID_ROLES.has(role)) return { ok: false, error: "Rol invalido" };

  const outcome = await issueInvite({
    actor: {
      userId: ctx.userId ?? "",
      email: ctx.userEmail,
      roleInAgency: membership.role,
    },
    agencyId: ctx.scopedAgencyId,
    agencyName: ctx.scopedAgencyName ?? "Agency",
    agencySlug: ctx.scopedAgencySlug ?? "",
    email,
    role,
  });
  const result = mapInviteOutcome(outcome);

  if (!result.ok) return result;

  if (ctx.scopedAgencySlug) revalidatePath(`/admin/agencies/${ctx.scopedAgencySlug}`);
  return result;
}
