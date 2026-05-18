/**
 * Rate limiter in-memory por IP.
 *
 * Sliding fixed window: N requests por windowMs.
 * Limitación: estado por proceso. En Vercel serverless multi-región cada
 * función tiene su propia memoria → el límite efectivo es ~N×regions.
 * Suficiente para MVP. Cuando llegue carga real, migrar a Upstash Redis:
 *   - https://upstash.com/docs/redis/sdks/ts/getstarted
 *   - sliding window con SCRIPT LOAD + EVAL
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const BUCKETS = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = BUCKETS.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    BUCKETS.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt, retryAfterSec: 0 };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/**
 * Extrae IP del request. En Vercel viene en x-forwarded-for.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Limpieza periódica para evitar memory leak en procesos long-running.
 * Llamar opcionalmente desde un init module.
 */
export function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of BUCKETS) {
    if (v.resetAt <= now) BUCKETS.delete(k);
  }
}
