/**
 * Logger estructurado mínimo. Server-side only.
 * Output JSON-ish line por evento → Vercel/CloudWatch pueden parsearlo.
 *
 * Futuro: reemplazar por pino + transport a Sentry/Datadog.
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: Level;
  ctx: string;
  msg: string;
  data?: Record<string, unknown>;
  err?: { message: string; stack?: string };
  ts: string;
}

function emit(level: Level, ctx: string, msg: string, extra?: Record<string, unknown> | Error) {
  const payload: LogPayload = { level, ctx, msg, ts: new Date().toISOString() };
  if (extra instanceof Error) {
    payload.err = { message: extra.message, stack: extra.stack };
  } else if (extra && typeof extra === "object") {
    payload.data = extra;
  }
  const fn: (s: string) => void = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(payload));
}

export const log = {
  debug: (ctx: string, msg: string, data?: Record<string, unknown>) => emit("debug", ctx, msg, data),
  info: (ctx: string, msg: string, data?: Record<string, unknown>) => emit("info", ctx, msg, data),
  warn: (ctx: string, msg: string, data?: Record<string, unknown>) => emit("warn", ctx, msg, data),
  error: (ctx: string, msg: string, errOrData?: Error | Record<string, unknown>) => emit("error", ctx, msg, errOrData),
};
