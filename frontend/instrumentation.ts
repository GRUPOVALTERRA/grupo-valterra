import * as Sentry from "@sentry/nextjs";

/**
 * Next 15+ instrumentation hook - boots Sentry segun runtime.
 * Sin esto el SDK no se inicializa en server / edge.
 *
 * onRequestError: Next.js llama este hook cuando un Route Handler / Server
 * Component / Server Action throws. En Sentry v10 es captureRequestError
 * el que matchea esa firma.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
