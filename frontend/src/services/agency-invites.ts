import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { log } from "@/lib/logger";
import type { AgencyRole } from "@/services/agencies";

/**
 * Agency invites - Sprint 10 MF6.
 *
 * Estrategia zero-table:
 *  1. supabase.auth.admin.generateLink({type:'invite'}) crea pending user con
 *     user_metadata = { pending_agency_id, pending_role }
 *  2. Enviamos el action_link por Resend (email branded Valterra)
 *  3. User clickea -> /auth/callback exchange + procesamiento del metadata
 *
 * Caso edge: si el email ya existe en auth.users, generateLink type 'invite'
 * falla. Para MVP retornamos error con instruccion. Sprint posterior puede
 * agregar fallback con admin.updateUserById + type 'magiclink'.
 */

const SENDER = process.env.RESEND_SENDER ?? "Grupo Valterra <onboarding@resend.dev>";

interface InviteInput {
  email: string;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  role: AgencyRole;
  inviterEmail?: string | null;
  origin: string; // ej "https://grupo-valterra.vercel.app"
}

export interface InviteResult {
  ok: boolean;
  error?: string;
  emailSent?: boolean;
  userId?: string;
}

export async function inviteUserToAgency(input: InviteInput): Promise<InviteResult> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: "Supabase admin no configurado en el servidor" };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email invalido" };
  }

  const next = `/admin/leads`;
  const redirectTo = `${input.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  // Admin client (NO @supabase/ssr - no necesitamos cookies aca)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          pending_agency_id: input.agencyId,
          pending_role: input.role,
          invited_to_agency_name: input.agencyName,
          invited_by: input.inviterEmail ?? null,
        },
      },
    });

    if (error) {
      log.warn("invites", "generateLink error", { email, agencyId: input.agencyId, message: error.message });
      const msg = error.message.toLowerCase().includes("already")
        ? "Ese email ya tiene cuenta. Pedile que entre con magic link desde /admin/login (manual setup membership)."
        : error.message;
      return { ok: false, error: msg };
    }

    const actionLink = data.properties?.action_link;
    const userId = data.user?.id;
    if (!actionLink) {
      return { ok: false, error: "Supabase no devolvio action_link" };
    }

    // Enviar email branded via Resend (si esta configurado)
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      log.warn("invites", "RESEND_API_KEY ausente · link generado pero NO enviado", { email, actionLink });
      return { ok: true, emailSent: false, userId, error: "Email NO enviado: RESEND_API_KEY no configurado. Copiar link manualmente." };
    }

    try {
      const resend = new Resend(resendKey);
      const { error: rerr } = await resend.emails.send({
        from: SENDER,
        to: [email],
        subject: `Invitacion a ${input.agencyName} - Grupo Valterra`,
        html: renderInviteHtml({ ...input, email, actionLink }),
        text: renderInviteText({ ...input, email, actionLink }),
        headers: { "Idempotency-Key": `invite-${input.agencyId}-${email}` },
        tags: [
          { name: "type", value: "agency_invite" },
          { name: "agency", value: input.agencySlug },
        ],
      });
      if (rerr) {
        log.error("invites", "Resend error", { email, message: rerr.message });
        return { ok: true, emailSent: false, userId, error: `Link generado pero email fallo: ${rerr.message}` };
      }
    } catch (err) {
      log.error("invites", "resend exception", err instanceof Error ? err : { err: String(err) });
      return { ok: true, emailSent: false, userId, error: "Link generado pero email fallo" };
    }

    log.info("invites", "invitacion enviada", { email, agencyId: input.agencyId, role: input.role, userId });
    return { ok: true, emailSent: true, userId };
  } catch (err) {
    log.error("invites", "inviteUserToAgency exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/* ---------- email templates ---------- */

const NAVY = "#0A2342";
const GOLD = "#C9A86A";
const IVORY = "#F8F7F4";

interface RenderArgs extends InviteInput {
  email: string;
  actionLink: string;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderInviteHtml(a: RenderArgs): string {
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
    <h1 style="margin:14px 0 6px 0;font-size:22px;color:${NAVY};font-weight:800;">Te invitan a unirte a ${escape(a.agencyName)}</h1>
    <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#4A5568;">
      ${a.inviterEmail ? `${escape(a.inviterEmail)} te invito a colaborar como <b>${escape(a.role)}</b> en la plataforma de Grupo Valterra.` : `Recibiste una invitacion para colaborar como <b>${escape(a.role)}</b>.`}
    </p>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#4A5568;">
      Confirma tu acceso con el siguiente boton. El link es de un solo uso.
    </p>
    <p style="margin:24px 0;">
      <a href="${a.actionLink}" style="display:inline-block;background:${NAVY};color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;">Aceptar invitacion</a>
    </p>
    <p style="margin:0;font-size:12px;color:#94A3B8;word-break:break-all;">
      Si el boton no funciona, copia este link: ${escape(a.actionLink)}
    </p>
  </td></tr>
  <tr><td style="background:${NAVY};color:#fff;padding:18px 32px;font-size:11px;">
    <span style="opacity:0.7;">Sprint 10 MF6 - onboarding multi-tenant</span>
    <span style="color:${GOLD};float:right;letter-spacing:0.14em;text-transform:uppercase;font-size:10px;">${escape(a.agencySlug)}</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderInviteText(a: RenderArgs): string {
  return [
    `GRUPO VALTERRA - Invitacion a ${a.agencyName}`,
    ``,
    a.inviterEmail
      ? `${a.inviterEmail} te invito como ${a.role} en la plataforma.`
      : `Recibiste una invitacion como ${a.role}.`,
    ``,
    `Aceptar (link de un solo uso):`,
    a.actionLink,
    ``,
    `--`,
    `Soluciones Inmobiliarias del Litoral`,
  ].join("\n");
}
