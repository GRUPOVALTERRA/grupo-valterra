import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * next.config.ts - Production hardening.
 *
 * - Security headers OWASP basics (CSP enforced, HSTS, X-Frame, etc.)
 * - CSP enforce activado post 48h Sprint 9.5 sin violations.
 *   Si en el futuro suma dominios externos (Cloudinary, Mapbox, PostHog),
 *   agregarlos a la whitelist correspondiente antes del deploy.
 * - remotePatterns documenta los dominios externos para next/image (Sprint 11).
 * - Sentry wrap v10: sourcemaps.disable=true en MVP (no requiere
 *   SENTRY_AUTH_TOKEN). Sprint 11 activa symbolication agregando el token.
 */

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://*.supabase.in",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.ingest.sentry.io https://*.sentry.io",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // CSP enforce (era Report-Only durante Sprint 9.5 - sin violations en 48h)
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
};

// Sentry wrap v10 - sin sourcemap upload en MVP.
// Para activar symbolication: setear SENTRY_AUTH_TOKEN en Vercel y cambiar
// sourcemaps.disable a false.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  sourcemaps: {
    disable: true,
  },
});
