import { NextResponse, after, type NextRequest } from "next/server";
import {
  validateEvent,
  visitHash,
  isIngestionEnabled,
  type SiteEventRow,
} from "@/lib/events";
import { rateLimit, getClientIp, ipFingerprint } from "@/lib/rate-limit";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * VALTERRA DATA & ANALYTICS — WEB ANALYTICS · ingesta de eventos propios.
 * S20-PR1.
 *
 * Recibe pageviews y wa_click del sitio publico y los persiste en
 * `site_events`. Complementa a Vercel Web Analytics (que sigue montado y no
 * se toca): en plan Hobby Vercel no expone custom events, asi que el
 * `track("wa_click")` de WaLink se emite pero no se puede leer ni segmentar.
 *
 * TRES DECISIONES QUE EXPLICAN TODO EL ARCHIVO:
 *
 * 1. SIEMPRE 204, pase lo que pase. Un evento descartado, un rate limit
 *    alcanzado y un insert fallido son indistinguibles desde afuera. Este
 *    endpoint es publico y sin auth: cualquier codigo de estado distinto
 *    seria un oraculo para sondear el estado interno del sistema.
 *
 * 2. El cliente NUNCA elige agency_id ni referrer_host. El primero se
 *    resuelve server-side desde property_slug; el segundo sale del header
 *    Referer. Si se aceptaran del body, cualquiera podria imputarle
 *    visitas a la agencia que quisiera y el tablero multi-agencia dejaria
 *    de ser confiable.
 *
 * 3. SOLO PRODUCTION PERSISTE (S20-PR2). Preview y Production comparten la
 *    misma base de Supabase. Sin este guardrail, cada branch en Preview y
 *    cada corrida de QA inyectaria filas indistinguibles del trafico real y
 *    el tablero mediria nuestro propio ruido. El chequeo es fail-closed y
 *    server-side: depende solo de VERCEL_ENV, nunca de algo que el cliente
 *    pueda mandar. La respuesta sigue siendo 204, asi que desde afuera un
 *    Preview y Production son indistinguibles.
 *
 * 4. LOS LOGS VAN SANEADOS. Nunca se registra el mensaje crudo de Supabase,
 *    ni el stack, ni el payload recibido: los mensajes de error de un
 *    driver de base pueden arrastrar fragmentos de query, nombres de
 *    columnas y hasta valores de la fila. A los logs va la operacion y un
 *    codigo de error; nada mas. Al cliente, ni eso.
 *
 * NATURALEZA DEL DATO: lo que entra aca es TELEMETRIA OBSERVADA. El
 * endpoint es publico y alguien puede intentar inflarlo. El rate limit y la
 * validacion reducen el ruido, pero el tablero debe leer `site_events` como
 * observacion, no como contabilidad.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 120 eventos/minuto por IP. Holgado para navegacion real (una sesion
 * activa genera pocas decenas de pageviews) y suficientemente ajustado
 * para que inflar el tablero a mano sea tedioso.
 *
 * Limitacion conocida y heredada de lib/rate-limit: el estado es por
 * proceso, asi que en serverless multi-region el limite efectivo es
 * ~N x regiones. Aceptable para telemetria; no lo seria para auth.
 */
const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/**
 * Cota de lectura del body. Un evento legitimo pesa unos cientos de bytes.
 *
 * Se aplica LEYENDO EL STREAM Y CORTANDO, no confiando en Content-Length:
 * ese header es opcional (falta en `Transfer-Encoding: chunked`) y lo
 * controla el cliente, asi que como unica defensa seria decorativo. Ver
 * readBoundedText().
 */
const MAX_BODY_BYTES = 2_000;

/** Respuesta unica del endpoint (ver decision 1). */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Lee el body con una cota REAL de bytes.
 *
 * Consume el stream de a chunks y aborta apenas se supera el limite, sin
 * bufferear el resto: un body gigante no llega a materializarse en memoria.
 * Devuelve null si se excede la cota o si el cuerpo no es texto valido.
 */
async function readBoundedText(request: NextRequest, maxBytes: number): Promise<string | null> {
  const body = request.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        // Corta el stream: el emisor deja de mandar y nada mas se acumula.
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request.headers);
  // La IP se usa para rate-limit y para derivar el pseudonimo diario, pero
  // NUNCA se guarda ni se loguea: a los logs va solo su huella.
  const ipFp = ipFingerprint(ip);

  // ---- GUARDRAIL DE ENTORNO (S20-PR2, ver decision 4).
  //      Va PRIMERO: si este deploy no puede escribir, no tiene sentido
  //      leer el body ni consumir cupo de rate limit. Fail-closed.
  //      NOTA: en local (`npm run dev`) VERCEL_ENV no existe, asi que el
  //      endpoint responde 204 sin escribir. Es deliberado — el desarrollo
  //      no debe ensuciar las metricas comerciales.
  if (!isIngestionEnabled(process.env.VERCEL_ENV)) {
    log.debug("api/events", "ingesta deshabilitada en este entorno", {
      ipFp,
      // El nombre del entorno NO es un secreto y no identifica a nadie.
      env: process.env.VERCEL_ENV ?? "unset",
    });
    return noContent();
  }

  const rl = rateLimit(`events:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    log.warn("api/events", "rate limit", { ipFp });
    return noContent();
  }

  // ---- Body con cota real de bytes (ver readBoundedText).
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text === null) {
    log.warn("api/events", "body ilegible o excede la cota", { ipFp });
    return noContent();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Sin detalle del parser y sin el texto recibido: podria traer lo que
    // sea que el cliente haya mandado.
    log.warn("api/events", "JSON invalido", { ipFp });
    return noContent();
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    log.warn("api/events", "body no es un objeto", { ipFp });
    return noContent();
  }

  // ---- Validacion contra allowlists (lib/events.ts).
  const result = validateEvent({
    body: raw as Record<string, unknown>,
    // NO se pasa el header Referer: el POST sale de una pagina de Valterra,
    // asi que ese header trae nuestra propia URL y destruia la atribucion
    // (todo el trafico parecia venir de nosotros mismos). El referrer real
    // llega en el body desde document.referrer, ya reducido a hostname.
    // `Host` se usa solo para descartar un referrer interno.
    selfHost: request.headers.get("host"),
  });

  if (!result.valid) {
    // `reason` es un valor de un union cerrado propio, no texto del cliente.
    log.warn("api/events", "evento descartado", { ipFp, reason: result.reason });
    return noContent();
  }

  const event = result.event;

  // ---- Pseudonimo diario: rota cada dia, null sin sal (ver lib/events).
  const hash = visitHash(ip, request.headers.get("user-agent"), process.env.EVENTS_HASH_SALT);

  // ---- Persistencia fuera del camino critico de la respuesta.
  //      `after` deja que el 204 salga ya: el cliente esta a punto de
  //      navegar a wa.me y no debe esperar a Supabase.
  after(async () => {
    await persist(event, hash, ipFp);
  });

  return noContent();
}

/**
 * Extrae un codigo de error corto y seguro de un error de Supabase.
 *
 * Se toma SOLO `code` (un identificador tipo "23514", "PGRST116"). Nunca
 * `message`, `details` ni `hint`: esos campos pueden incluir fragmentos de
 * la query y valores de la fila que se intento insertar.
 */
function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_]{1,20}$/.test(code)) return code;
  }
  return "unknown";
}

/**
 * Inserta la fila. Resuelve agency_id server-side y traga cualquier error:
 * perder un evento de telemetria jamas debe afectar al visitante.
 */
async function persist(
  event: SiteEventRow,
  hash: string | null,
  ipFp: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    log.warn("api/events", "Supabase no configurado — evento no persistido", { ipFp });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    // agency_id derivado del slug, NUNCA del body (ver decision 2).
    let agencyId: string | null = null;
    if (event.property_slug) {
      const { data, error } = await supabase
        .from("properties")
        .select("agency_id")
        .eq("slug", event.property_slug)
        .maybeSingle();

      if (error) {
        log.warn("api/events", "fallo de base", {
          ipFp,
          operation: "lookup-agency",
          code: errorCode(error),
        });
      } else {
        agencyId = (data?.agency_id as string | undefined) ?? null;
      }
    }

    // La fila se construye campo por campo: nada del body llega por spread.
    const { error } = await supabase.from("site_events").insert({
      event_type: event.event_type,
      path: event.path,
      property_slug: event.property_slug,
      source: event.source,
      referrer_host: event.referrer_host,
      utm_source: event.utm_source,
      utm_medium: event.utm_medium,
      utm_campaign: event.utm_campaign,
      agency_id: agencyId,
      visit_hash: hash,
    });

    if (error) {
      log.error("api/events", "fallo de base", {
        ipFp,
        operation: "insert",
        code: errorCode(error),
        eventType: event.event_type,
      });
      return;
    }

    // Solo campos de un union cerrado propio. Ni siquiera el path validado
    // va al log: ya esta en la tabla, y el log es un destino con retencion y
    // control de acceso distintos a los de la base.
    log.debug("api/events", "evento registrado", {
      operation: "insert",
      eventType: event.event_type,
      source: event.source ?? "n/a",
    });
  } catch (err) {
    // Solo el NOMBRE de la excepcion. Ni message ni stack: un stack puede
    // arrastrar rutas internas y argumentos.
    log.error("api/events", "excepcion al persistir", {
      ipFp,
      operation: "persist",
      kind: err instanceof Error ? err.name : "unknown",
    });
  }
}
