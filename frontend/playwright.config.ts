import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — smoke E2E de Grupo Valterra.
 *
 * Corre contra una URL desplegada (BASE_URL), por defecto producción.
 * Son smoke tests de superficie pública + guardas de auth; NO requieren
 * secretos ni sesión. Los flujos autenticados (login magic link, scoping
 * por agencia) quedan diferidos hasta tener un entorno de auth de prueba
 * (ver e2e/README).
 *
 * Uso:
 *   npm run e2e                       # contra prod
 *   BASE_URL=http://localhost:3000 npm run e2e   # contra un build local
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    // Dominio propio: es el canónico desde el 02-08 y, además, algunas redes
    // corporativas (FortiGuard) bloquean *.vercel.app y hacían fallar el
    // smoke por timeout en la máquina real sin que hubiera defecto alguno.
    baseURL: process.env.BASE_URL ?? "https://www.grupovalterra.com.ar",
    trace: "on-first-retry",
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
