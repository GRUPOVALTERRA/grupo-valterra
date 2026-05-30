# QA Post-Deploy Checklist · Grupo Valterra

> Quick-list operativa · 10 pasos · usar después de cada merge a `main` que dispare deploy en Vercel.

## Cuándo usar

- Después de mergear cualquier feature branch a `main` (MFs Sprint X)
- Después de cualquier rollback / promote previous deploy
- Antes de declarar "el deploy funciona en producción"
- Antes de comunicar éxito a stakeholders

## Checklist

```
□ 1.  Abrir preview en INCÓGNITO              (zero cache · zero Router Cache · zero prefetch)
□ 2.  Login admin                              (ADMIN_PASSWORD o magic link según rol)
□ 3.  /admin/properties                        (lista scoped per agency · scope badge visible)
□ 4.  Editar imagen                            (click "Editar imagen" en cualquier property)
□ 5.  Seleccionar archivo                      (JPG/PNG/WEBP <5MB · respeta requisitos premium)
□ 6.  Preview instantáneo LEFT                 (LEFT panel cambia inmediatamente al blob URL local)
□ 7.  Upload OK                                (toast verde "Cover actualizada" · button "Subido")
□ 8.  Click "ver en Storage"                   (nueva pestaña abre la URL pública con la imagen subida)
□ 9.  Página pública renderiza imagen          (visitar /propiedades/<slug> en incógnito · cover visible)
□ 10. /api/health commit coincide              (campo `commit` matchea los primeros 7 chars del SHA pusheado)
```

## Regla de oro

> **Si no lo testeaste en INCÓGNITO, no lo testeaste.**

Toda validación post-deploy se hace en ventana incógnita / privada. Tabs normales pueden tener Router Cache + HTTP cache del deploy anterior que generan falsos negativos.

## Si algún paso falla

1. Verificar el campo `commit` en `/api/health` matchea el SHA pusheado.
2. Si SHA OK pero comportamiento es viejo → re-test en **otro browser** (Chrome/Firefox/Safari distinto).
3. Si reproduce en 2+ browsers en incógnita y 5+ min post-deploy → es bug real → abrir issue / rollback.
4. Si solo reproduce en tu tab habitual → cache cliente · `Ctrl+Shift+R` lo resuelve · no es bug.

## Smoke tests adicionales por flow tocado

Si el sprint tocó algo además de properties cover, sumar al checklist:

- **/api/contact** → enviar lead de prueba → verificar email Resend
- **/admin/leads** → lead aparece en panel con scope correcto
- **/admin/agencies** → super-admin lista agencies
- **/admin/login magic link** → enviar a tu email · click link · entra a /admin/leads
- **Home `/`** → property card render OK con imagen actual

## Referencias

- Sprint 11 MF2 closing report (memo previo · MF2 shipped state)
- `next.config.ts` · `experimental.serverActions.bodySizeLimit` ya cubre uploads hasta 5MB
- `/api/health` endpoint (Sprint 9.5) expone `commit`, `region`, `deploy_id`, `checks.sentry`
