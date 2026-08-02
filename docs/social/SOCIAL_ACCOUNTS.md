# Cuentas sociales oficiales — Grupo Valterra

Fuente de verdad de URLs en código: `frontend/src/lib/social.ts` (guarda automática en
`frontend/e2e/social-docs-unit.spec.ts` — si este documento difiere del código, CI falla).

| Plataforma | URL oficial | Handle visible | Estado | Verificada | Responsable |
| --- | --- | --- | --- | --- | --- |
| Facebook | https://www.facebook.com/profile.php?id=61593004700771 | Grupo Valterra (página por ID, sin username) | Activa | 02/08/2026 | Gustavo (Owner) |
| Instagram | https://www.instagram.com/grupovalterraar | @grupovalterraar | Activa | 02/08/2026 | Gustavo (Owner) |
| TikTok | https://www.tiktok.com/@grupovalterra_ok | @grupovalterra_ok | Activa | 02/08/2026 | Gustavo (Owner) |
| X | https://x.com/grupovalterraar | @grupovalterraar | Activa | 02/08/2026 | Gustavo (Owner) |

## Notas

- **TikTok — cambio futuro previsto:** el username pasaría a `@grupovalterraar` alrededor del
  **01/09/2026**. Es una ACCIÓN PENDIENTE, no un hecho: no actualizar código ni documentación
  hasta verificar que el cambio ocurrió (ver `SOCIAL_CHANGELOG.md`).
- **Facebook:** la página aún no tiene username propio; se enlaza por ID. Si algún día se
  reclama un username, actualizar PRIMERO `lib/social.ts` y después este documento.
- La verificación del 02/08/2026 se hizo abriendo cada URL con la sesión del Owner
  (perfil propio con botón "Editar perfil" / vista de administrador en todas).
