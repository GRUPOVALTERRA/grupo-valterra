import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Healthcheck publico para uptime monitors / Vercel / Kubernetes-style probes.
 *
 * Respuesta JSON:
 * {
 *   status:    "ok" | "degraded" | "down"
 *   db:        "connected" | "fallback" | "error"
 *   env:       "production" | "preview" | "development"
 *   uptime:    seconds desde que el proceso/instancia arranco
 *   timestamp: ISO 8601
 *   version:   semver de package.json
 *   commit:    short SHA del commit deployado (Vercel)
 *   region:    region Vercel donde corre el handler
 *   deploy_id: ID interno del deploy (Vercel)
 *   checks: {
 *     supabase: { configured, latencyMs, error? }
 *     auth_middleware: "active" | "permissive"
 *     sentry: "active" | "disabled"
 *   }
 * }
 *
 * Sprint 9.5: agregados commit / region / deploy_id / sentry flag.
 * Backward compat: campos nuevos opcionales, los consumers viejos siguen funcionando.
 */

const PROCESS_START = Date.now();

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  db: "connected" | "fallback" | "error";
  env: string;
  uptime: number;
  timestamp: string;
  version: string;
  commit?: string;
  region?: string;
  deploy_id?: string;
  checks: {
    supabase: { configured: boolean; latencyMs: number; error?: string };
    auth_middleware: "active" | "permissive";
    sentry: "active" | "disabled";
  };
}

export async function GET() {
  const t0 = Date.now();
  let db: HealthResponse["db"] = "fallback";
  let supabaseError: string | undefined;
  let supabaseLatency = 0;

  if (isSupabaseConfigured()) {
    const tDb = Date.now();
    try {
      const client = getSupabaseAdmin();
      const { error } = await withTimeout(
        client.from("leads").select("id", { count: "exact", head: true }),
        4000,
        "health.ping",
      );
      supabaseLatency = Date.now() - tDb;
      if (error) {
        db = "error";
        supabaseError = error.message;
      } else {
        db = "connected";
      }
    } catch (e) {
      supabaseLatency = Date.now() - tDb;
      db = "error";
      supabaseError = e instanceof Error ? e.message : "unknown";
    }
  }

  const overall: HealthResponse["status"] = db === "error" ? "degraded" : "ok";

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const region = process.env.VERCEL_REGION;
  const deployId = process.env.VERCEL_DEPLOYMENT_ID;

  const body: HealthResponse = {
    status: overall,
    db,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    uptime: Math.floor((Date.now() - PROCESS_START) / 1000),
    timestamp: new Date().toISOString(),
    version: (pkg as { version: string }).version,
    ...(commitSha ? { commit: commitSha.slice(0, 7) } : {}),
    ...(region ? { region } : {}),
    ...(deployId ? { deploy_id: deployId } : {}),
    checks: {
      supabase: {
        configured: isSupabaseConfigured(),
        latencyMs: supabaseLatency,
        ...(supabaseError ? { error: supabaseError } : {}),
      },
      auth_middleware: process.env.ADMIN_TOKEN ? "active" : "permissive",
      sentry: process.env.SENTRY_DSN ? "active" : "disabled",
    },
  };

  return NextResponse.json(body, {
    headers: { "X-Response-Time-Ms": String(Date.now() - t0) },
  });
}
