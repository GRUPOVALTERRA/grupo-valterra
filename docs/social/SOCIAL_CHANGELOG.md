# Changelog social — Grupo Valterra

Registrar acá todo cambio de handle, URL o política. Cada cambio lo confirma el Owner
(Gustavo) ANTES de tocar código o documentación.

## Estado actual (02/08/2026)

- Facebook: página por ID 61593004700771 (sin username) — activa.
- Instagram: @grupovalterraar — activa.
- TikTok: @grupovalterra_ok — activa.
- X: @grupovalterraar — activa.
- Enlaces integrados al sitio (footer + sección contacto) via `frontend/src/lib/social.ts` (PR #14).

## Acciones futuras PENDIENTES (no consumadas)

| # | Acción | Fecha estimada | Confirma | Al confirmarse, tocar |
| --- | --- | --- | --- | --- |
| 1 | TikTok cambia a @grupovalterraar | ~01/09/2026 | Gustavo | `lib/social.ts` (solo la URL) + SOCIAL_ACCOUNTS.md + este changelog |
| 2 | Username propio de Facebook (si se reclama) | sin fecha | Gustavo | `lib/social.ts` + SOCIAL_ACCOUNTS.md |
| 3 | Conectar https://www.grupovalterra.com.ar al sitio (hoy prod en grupo-valterra.vercel.app; la zona DNS solo tiene registros de correo) | sin fecha | Gustavo | DNS Cloudflare + Vercel; las bios ya usan la URL del dominio |
| 4 | Rescatar avatar-social.png de la branch histórica al repo | sin fecha | Director | `frontend/public/brand/` |
| 5 | WhatsApp Business (línea nueva vs migrar la actual) | sin fecha | Gustavo | Botones de contacto en IG/FB |

## Historial

- 02/08/2026 — Kit operativo reconstruido desde main (`docs/s16-social-operations-kit`);
  la branch documental histórica NO se mergeó (contenía domicilio físico y handles propuestos
  que no coinciden con las cuentas reales).
- 02/08/2026 — PR #14: enlaces sociales verificados integrados al sitio, sin domicilio.
