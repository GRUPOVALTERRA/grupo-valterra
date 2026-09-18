# Changelog social — Grupo Valterra

Registrar acá todo cambio de handle, URL o política. Cada cambio lo confirma el Owner
(Gustavo) ANTES de tocar código o documentación.

## Estado actual (18/09/2026)

- Facebook: página por ID 61593004700771 (sin username) — activa. URL canónica en código:
  la corta por ID; la forma larga con `profile.php` redirige a la misma página.
- Instagram: @grupovalterraar — activa.
- TikTok: @grupovalterraar — activa (antes @grupovalterra_ok, ver Historial).
- X: @grupovalterraar — activa.
- YouTube: @grupovalterra — activa.
- Enlaces integrados al sitio (footer + sección contacto) via `frontend/src/lib/social.ts` (PR #14).
- Dominio https://www.grupovalterra.com.ar CONECTADO y sirviendo producción (02/08/2026).

## Acciones futuras PENDIENTES (no consumadas)

| # | Acción | Fecha estimada | Confirma | Al confirmarse, tocar |
| --- | --- | --- | --- | --- |
| 1 | Username propio de Facebook (si se reclama) | sin fecha | Gustavo | `lib/social.ts` + SOCIAL_ACCOUNTS.md |
| 2 | Rescatar avatar-social.png de la branch histórica al repo | sin fecha | Director | `frontend/public/brand/` |
| 3 | WhatsApp Business (línea nueva vs migrar la actual) | sin fecha | Gustavo | Botones de contacto en IG/FB |

## Historial

- 18/09/2026 — ✅ CONSUMADO: TikTok pasó de @grupovalterra_ok a @grupovalterraar (acción
  pendiente #1, estimada para el 01/09). Confirmado por el Owner y verificado abriendo el
  perfil. Tocado: `lib/social.ts`, SOCIAL_ACCOUNTS.md, este changelog y las dos guardas que
  fijaban el handle viejo.
- 18/09/2026 — Kit documental resincronizado con el código: SOCIAL_ACCOUNTS.md pasa a la URL
  corta de Facebook por ID (la misma página que la forma larga con `profile.php`) y suma
  YouTube, que estaba en `lib/social.ts` desde S20 y nunca se documentó. Se corrigió además
  la guarda documental, que descartaba youtube.com al comparar y por eso no podía pasar
  nunca, ni siquiera con el documento correcto.

- 02/08/2026 — ✅ COMPLETADO: dominio https://www.grupovalterra.com.ar conectado al sitio.
  Evidencia: /api/health en el dominio responde ok, db connected, commit `cff2ffd` (producción
  vigente). Verificado por el Director en gate S16-QA.
- 02/08/2026 — Kit operativo reconstruido desde main (`docs/s16-social-operations-kit`);
  la branch documental histórica NO se mergeó (contenía domicilio físico y handles propuestos
  que no coinciden con las cuentas reales).
- 02/08/2026 — PR #14: enlaces sociales verificados integrados al sitio, sin domicilio.
