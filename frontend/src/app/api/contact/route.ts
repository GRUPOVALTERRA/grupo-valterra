import { NextResponse, after, type NextRequest } from "next/server";
import { validateLead } from "@/lib/validateLead";
import { addLead, getAllLeads, computeStats } from "@/services/mock-leads";
import { rateLimit, getClientIp, ipFingerprint } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { processLeadNotification } from "@/services/lead-notifications";
import { getAgencyContactByPropertySlug, getValterraAgencyId } from "@/services/agencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ContactResponse =
  | { ok: true; leadId: string }
  | { ok: false; error: "validation"; details: Record<string, string> }
  | { ok: false; error: "spam" | "rate-limit" | "server"; retryAfterSec?: number };

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(request: NextRequest): Promise<NextResponse<ContactResponse>> {
  const ip = getClientIp(request.headers);
  // La IP se usa para el rate-limit, pero NUNCA se registra: a los logs va solo su huella.
  const ipFp = ipFingerprint(ip);

  // Rate limit
  const rl = rateLimit(`contact:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    log.warn("api/contact", "rate limit", { ipFp, retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "rate-limit", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "validation", details: { _root: "JSON invalido" } },
      { status: 400 },
    );
  }

  const data = (body ?? {}) as Record<string, unknown>;

  // Honeypot
  if (typeof data.website === "string" && data.website.length > 0) {
    log.warn("api/contact", "honeypot disparado", { ipFp });
    return NextResponse.json({ ok: false, error: "spam" }, { status: 400 });
  }

  // Validacion
  const result = validateLead({
    name: data.name,
    email: data.email,
    phone: data.phone,
    message: data.message,
    propertyTitle: data.propertyTitle,
    propertySlug: data.propertySlug,
  });

  if (!result.valid) {
    return NextResponse.json(
      { ok: false, error: "validation", details: result.errors },
      { status: 400 },
    );
  }

  // ============================================================
  // Sprint 10 MF5 - resolver agency_id del lead
  //
  // Prioridad:
  //  1. propertySlug presente -> lookup properties.agency_id (JOIN)
  //  2. Fallback canonico -> Valterra.id (consultas generales / property no encontrada)
  //  3. Si todo falla -> null (lead queda huerfano, igual se persiste)
  // ============================================================
  let resolvedAgencyId: string | null = null;
  let resolution: "property" | "fallback" | "none" = "none";

  if (result.data.propertySlug) {
    const ac = await getAgencyContactByPropertySlug(result.data.propertySlug);
    if (ac?.agencyId) {
      resolvedAgencyId = ac.agencyId;
      resolution = "property";
    }
  }

  if (!resolvedAgencyId) {
    resolvedAgencyId = await getValterraAgencyId();
    if (resolvedAgencyId) resolution = "fallback";
  }

  log.info("lead_agency_resolution", "resolved", {
    propertySlug: result.data.propertySlug ?? null,
    agencyId: resolvedAgencyId,
    resolution,
  });

  // Persistencia
  try {
    const lead = await addLead({
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      message: result.data.message,
      propertyTitle: result.data.propertyTitle,
      propertySlug: result.data.propertySlug,
      agencyId: resolvedAgencyId ?? undefined,
      source: "contact-form",
    });
    log.info("api/contact", "lead creado", {
      id: lead.id, ipFp, propertySlug: lead.propertySlug, agencyId: lead.agencyId, resolution,
    });

        // S16-LEAD-OBS: el envio corre DESPUES de responder, pero dentro del ciclo
    // de vida garantizado de la funcion. La promesa suelta anterior podia
    // truncarse cuando el runtime congelaba la funcion al devolver el 201.
    // Contrato publico intacto: el lead ya esta persistido y la respuesta no
    // espera al proveedor. Una notificacion fallida NO invalida el lead.
    //
    // Se captura el objeto `lead` y no solo `lead.id` de forma deliberada:
    // el correo necesita nombre, telefono, mensaje y propiedad, asi que
    // releerlo server-side exigiria un getLeadById nuevo y un viaje extra a
    // la base para terminar con los MISMOS datos en memoria. El closure vive
    // en el mismo proceso y el mismo request donde esa informacion ya existe:
    // no cruza red, no se serializa y no se persiste. La proteccion real esta
    // en que ni los logs ni las columnas nuevas reciben PII (tests 13/14/H1).
    after(async () => {
      try {
        await processLeadNotification(lead);
      } catch (err) {
        log.error("api/contact", "processLeadNotification unexpected throw", { leadId: lead.id, errorName: err instanceof Error ? err.name : "unknown" });
      }
    });

    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (err) {
    // Solo el NOMBRE del error: el objeto completo arrastra stack y, potencialmente,
    // fragmentos del payload del lead.
    log.error("api/contact", "persistencia fallo", { errorName: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }
  try {
    const leads = await getAllLeads();
    return NextResponse.json({
      ok: true,
      count: leads.length,
      stats: computeStats(leads),
      leads,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "server", message: String(err) },
      { status: 500 },
    );
  }
}
