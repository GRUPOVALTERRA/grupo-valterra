import * as Sentry from "@sentry/nextjs";

/**
 * Sentry edge runtime - Sprint 9.5 minimal MVP.
 * Mismo perfil que server.config: solo errores, sin tracing.
 */

const DSN = process.env.SENTRY_DSN;
const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

Sentry.init({
  dsn: DSN,
  enabled: Boolean(DSN),
  environment: ENV,
  tracesSampleRate: 0,
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
});
