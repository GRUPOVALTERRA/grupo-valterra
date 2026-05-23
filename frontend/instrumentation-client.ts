import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side - Sprint 9.5 minimal MVP.
 *
 * Captura solo errors. Sin Session Replay, sin tracing.
 * DSN publico (NEXT_PUBLIC_) - es OK por diseno del SDK.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production";

Sentry.init({
  dsn: DSN,
  enabled: Boolean(DSN),
  environment: ENV,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
