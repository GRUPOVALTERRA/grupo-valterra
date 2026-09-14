# E2E — smoke tests (Playwright)

Smoke tests de superficie pública + guardas de auth. **No requieren sesión ni secretos.**

## Correr
```bash
npm run e2e                                   # contra producción (default)
BASE_URL=http://localhost:3000 npm run e2e    # contra un build local (npm run build && npm start)
npm run e2e:ui                                # modo UI interactivo
```
En CI: workflow manual `E2E smoke` (Actions → Run workflow), parámetro `base_url`.

## Cobertura actual (8 tests)
- Portal público: home, `/propiedades` (listado + filtros), detalle de propiedad publicada (metadata + contacto).
- Guardas admin: `/admin/leads` y `/admin/properties` sin sesión → redirect a `/admin/login`.
- SEO/infra: `robots.txt` (Disallow /admin), `sitemap.xml`, `/api/health`.

## S26 — mapa estratégico y botón flotante (`E2E_MAP=1`)
`e2e/map-smoke.spec.ts` corre Leaflet de verdad: tiles OSM bajo la CSP, pines/clusters, tarjeta,
link de WhatsApp con el mensaje aprobado, botón flotante, guard de `/admin/agencia`, sitemap.
Requiere un build que ya tenga S26; hasta el merge va guardado (contra producción se omite):
```powershell
# ventana 1: npm run dev          # ventana 2:
$env:E2E_MAP="1"; $env:BASE_URL="http://localhost:3000"; npx playwright test e2e/map-smoke.spec.ts --reporter=line
```
Después del merge se quita la guarda para que corra siempre contra producción (micro-PR de higiene).

## Diferido (requiere entorno de auth de prueba)
Flujos **autenticados** — login por magic link, scoping por agencia (un miembro ve solo su agencia),
member management — NO están automatizados todavía. Dependen de:
1. Entrega de email confiable (Resend con dominio verificado) para el magic link, o
2. Una estrategia de sesión de prueba sembrada (token/cookie de un usuario de QA).
Hasta entonces, esos flujos se validan manualmente. El fix de RLS (VALTERRA-BUG-001) que los
habilita ya está aplicado y validado a nivel base de datos en producción.
