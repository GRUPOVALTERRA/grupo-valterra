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

## Diferido (requiere entorno de auth de prueba)
Flujos **autenticados** — login por magic link, scoping por agencia (un miembro ve solo su agencia),
member management — NO están automatizados todavía. Dependen de:
1. Entrega de email confiable (Resend con dominio verificado) para el magic link, o
2. Una estrategia de sesión de prueba sembrada (token/cookie de un usuario de QA).
Hasta entonces, esos flujos se validan manualmente. El fix de RLS (VALTERRA-BUG-001) que los
habilita ya está aplicado y validado a nivel base de datos en producción.
