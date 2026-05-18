import { NextResponse, type NextRequest } from "next/server";
import { validateLead } from "@/lib/validateLead";
import { addLead, getAllLeads, computeStats } from "@/services/mock-leads";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ContactResponse =
  | { ok: true; leadId: string }
  | { ok: false; error: "validation"; details: Record<string, string> }
  | { ok: false; error: "spam" | "rate-limit" | "server"; retryAfterSec?: number };

const RATE_LIMIT = { limit: 5, windowMs: 60_000 }; // 5 leads/min por IP

export async function POST(request: NextRequest): Promise<NextResponse<ContactResponse>> {
  const ip = getClientIp(request.headers);

  // Rate limit
  const rl = rateLimit(`contact:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    log.warn("api/contact", "rate limit", { ip, retryAfterSec: rl.retryAfterSec });
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
      { ok: false, error: "validation", details: { _root: "JSON inválido" } },
      { status: 400 },
    );
  }

  const data = (body ?? {}) as Record<string, unknown>;

  // Honeypot
  if (typeof data.website === "string" && data.website.length > 0) {
    log.warn("api/contact", "honeypot disparado", { ip });
    return NextResponse.json({ ok: false, error: "spam" }, { status: 400 });
  }

  // Validación
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

  // Persistencia
  try {
    const lead = await addLead({
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      message: result.data.message,
      propertyTitle: result.data.propertyTitle,
      propertySlug: result.data.propertySlug,
      source: "contact-form",
    });
    log.info("api/contact", "lead creado", { id: lead.id, ip, propertySlug: lead.propertySlug });
    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (err) {
    log.error("api/contact", "persistencia falló", err instanceof Error ? err : { err: String(err) });
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
