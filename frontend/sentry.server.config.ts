import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side - Sprint 9.5 minimal MVP.
 *
 * Captura:
 *   - server errors no controlados
 *   - API route failures
 *   - production exceptions
 *
 * NO captura:
 *   - tracing / performance (tracesSampleRate: 0)
 *   - profiling (no se inicializa)
 *
 * Si SENTRY_DSN no esta seteado el SDK queda en no-op (enabled: false).
 * Si esta seteado, los errores van al proyecto Sentry de Valterra.
 */

const DSN = process.env.SENTRY_DSN;
const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

Sentry.init({
  dsn: DSN,
  enabled: Boolean(DSN),
  environment: ENV,
  tracesSampleRate: 0,
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

  beforeSend(event) {
    // Filtrar warnings de fallback memoria - son esperados, no errores
    const msg = event.message ?? event.exception?.values?.[0]?.value ?? "";
    if (msg.includes("fallback memoria activado")) return null;
    if (msg.includes("tabla properties vacia")) return null;
    if (msg.includes("supabase no configurado")) return null;
    return event;
  },
});
