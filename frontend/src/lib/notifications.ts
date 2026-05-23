import { Resend } from "resend";
import { log } from "@/lib/logger";
import type { Lead } from "@/services/mock-leads";

/**
 * Notifications layer - Sprint 9.5.
 *
 * Diseno:
 *   - Fire-and-forget desde /api/contact: si Resend falla, el lead YA
 *     esta persistido en Supabase. No bloqueamos la respuesta al usuario.
 *   - Multi-email destinatario: NOTIFICATION_EMAIL acepta CSV
 *     ("a@x.com,b@y.com,c@z.com"). Sanitiza espacios y vacios.
 *   - Idempotency: usamos lead.id como key para que reintentos no dupliquen.
 *   - Sandbox-friendly: si RESEND_API_KEY no esta, la funcion no-opea con un
 *     log.warn (no rompe el contact flow).
 *   - Sender: por defecto "onboarding@resend.dev" (sandbox publica de Resend).
 *     Cuando exista valterra.com.ar verificado, se cambia a "leads@valterra.com.ar".
 */

const SENDER = process.env.RESEND_SENDER ?? "Grupo Valterra <onboarding@resend.dev>";

let cachedClient: Resend | null = null;

function getResend(): Resend | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key);
  return cachedClient;
}

/** Parse "a@x.com, b@y.com,c@z.com" -> ["a@x.com","b@y.com","c@z.com"] */
export function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));
}

interface NotifyResult {
  ok: boolean;
  skipped?: "no-api-key" | "no-recipients";
  id?: string;
  error?: string;
}

/**
 * Envia email de notificacion de lead nuevo al equipo. NO lanza errores;
 * los problemas se loggean y se retornan en el objeto resultado.
 */
export async function notifyNewLead(lead: Lead): Promise<NotifyResult> {
  const client = getResend();
  if (!client) {
    log.warn("notifications", "RESEND_API_KEY no configurado - email skipped", { leadId: lead.id });
    return { ok: false, skipped: "no-api-key" };
  }

  const recipients = parseRecipients(process.env.NOTIFICATION_EMAIL);
  if (recipients.length === 0) {
    log.warn("notifications", "NOTIFICATION_EMAIL vacio - email skipped", { leadId: lead.id });
    return { ok: false, skipped: "no-recipients" };
  }

  const subject = lead.propertyTitle
    ? `Nueva consulta - ${lead.propertyTitle}`
    : `Nueva consulta general - ${lead.name}`;

  try {
    const { data, error } = await client.emails.send({
      from: SENDER,
      to: recipients,
      subject,
      html: renderHtml(lead),
      text: renderText(lead),
      headers: {
        // Idempotency key - Resend dedupea reintentos con el mismo key
        "Idempotency-Key": `lead-${lead.id}`,
      },
      tags: [
        { name: "type", value: "lead_notification" },
        { name: "source", value: lead.source },
      ],
    });

    if (error) {
      log.error("notifications", "Resend error", { leadId: lead.id, message: error.message });
      return { ok: false, error: error.message };
    }

    log.info("notifications", "email enviado", { leadId: lead.id, recipients: recipients.length, messageId: data?.id });
    return { ok: true, id: data?.id };
  } catch (err) {
    log.error("notifications", "notifyNewLead exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/* ---------- Templates ---------- */

const NAVY = "#0A2342";
const GOLD = "#C9A86A";
const IVORY = "#F8F7F4";

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function renderHtml(lead: Lead): string {
  const createdAt = new Date(lead.createdAt).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const phoneDigits = lead.phone.replace(/\D/g, "");
  const waLink = `https://wa.me/${phoneDigits}`;
  const mailtoLink = lead.email ? `mailto:${lead.email}` : null;
  const tel = `tel:${lead.phone}`;

  return `<!DOCTYPE html>
<html lang="es-AR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1a202c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px -16px rgba(10,35,66,0.18);">

        <tr><td style="background:${NAVY};padding:24px 28px;color:#fff;">
          <table role="presentation" width="100%"><tr>
            <td><span style="display:inline-block;background:${GOLD};color:${NAVY};font-weight:800;width:34px;height:34px;line-height:34px;text-align:center;border-radius:7px;font-size:14px;">VT</span></td>
            <td style="padding-left:12px;">
              <div style="font-weight:800;letter-spacing:0.06em;font-size:13px;">GRUPO VALTERRA</div>
              <div style="font-size:9px;letter-spacing:0.22em;color:${GOLD};text-transform:uppercase;margin-top:2px;">Soluciones Inmobiliarias del Litoral</div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:30px 32px 10px 32px;">
          <div style="display:inline-block;background:rgba(201,168,106,0.12);color:${GOLD};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Nueva consulta</div>
          <h1 style="margin:14px 0 6px 0;font-size:22px;color:${NAVY};font-weight:800;">${escape(lead.name)}</h1>
          <div style="color:#4A5568;font-size:13px;">${escape(createdAt)} - ref <code style="background:#F1F5F9;padding:1px 6px;border-radius:4px;color:${NAVY};">${escape(lead.id)}</code></div>
        </td></tr>

        ${lead.propertyTitle ? `<tr><td style="padding:8px 32px 0 32px;">
          <div style="background:${IVORY};border-left:4px solid ${GOLD};padding:14px 16px;border-radius:0 8px 8px 0;">
            <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#4A5568;">Propiedad consultada</div>
            <div style="font-size:14px;font-weight:600;color:${NAVY};margin-top:4px;">${escape(lead.propertyTitle)}</div>
            ${lead.propertySlug ? `<div style="font-size:12px;color:#4A5568;margin-top:2px;">slug: ${escape(lead.propertySlug)}</div>` : ""}
          </div>
        </td></tr>` : ""}

        <tr><td style="padding:20px 32px 0 32px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#4A5568;font-weight:600;">Mensaje</div>
          <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#1a202c;white-space:pre-wrap;">${escape(lead.message)}</div>
        </td></tr>

        <tr><td style="padding:24px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" style="padding-right:8px;">
                <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#4A5568;">Telefono</div>
                <div style="margin-top:4px;font-size:14px;font-weight:600;color:${NAVY};"><a href="${tel}" style="color:${NAVY};text-decoration:none;">${escape(lead.phone)}</a></div>
              </td>
              ${lead.email ? `<td width="50%" style="padding-left:8px;">
                <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#4A5568;">Email</div>
                <div style="margin-top:4px;font-size:14px;font-weight:600;color:${NAVY};"><a href="${mailtoLink}" style="color:${NAVY};text-decoration:none;">${escape(lead.email)}</a></div>
              </td>` : ""}
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:13px;">Contactar por WhatsApp</a></td>
              ${mailtoLink ? `<td style="padding-left:10px;"><a href="${mailtoLink}" style="display:inline-block;background:${NAVY};color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:13px;">Responder por email</a></td>` : ""}
            </tr>
          </table>
        </td></tr>

        <tr><td style="background:${NAVY};color:#fff;padding:18px 32px;font-size:11px;">
          <span style="opacity:0.7;">Notificacion automatica - lead persistido en /admin/leads</span>
          <span style="color:${GOLD};float:right;letter-spacing:0.14em;text-transform:uppercase;font-size:10px;">${escape(lead.source)}</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(lead: Lead): string {
  return [
    `NUEVA CONSULTA - GRUPO VALTERRA`,
    ``,
    `Nombre:    ${lead.name}`,
    `Telefono:  ${lead.phone}`,
    lead.email ? `Email:     ${lead.email}` : null,
    lead.propertyTitle ? `Propiedad: ${lead.propertyTitle}` : null,
    `Fuente:    ${lead.source}`,
    `Ref:       ${lead.id}`,
    ``,
    `Mensaje:`,
    lead.message,
    ``,
    `--`,
    `Lead persistido en /admin/leads`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
