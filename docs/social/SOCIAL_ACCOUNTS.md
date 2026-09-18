# Cuentas sociales oficiales — Grupo Valterra

Fuente de verdad de URLs en código: `frontend/src/lib/social.ts` (guarda automática en
`frontend/e2e/social-docs-unit.spec.ts` — si este documento difiere del código, la guarda falla).

| Plataforma | URL oficial | Handle visible | Estado | Verificada | Responsable |
| --- | --- | --- | --- | --- | --- |
| Facebook | https://www.facebook.com/1182768651594251 | Grupo Valterra (página por ID, sin username) | Activa | 18/09/2026 | Gustavo (Owner) |
| Instagram | https://www.instagram.com/grupovalterraar | @grupovalterraar | Activa | 02/08/2026 | Gustavo (Owner) |
| TikTok | https://www.tiktok.com/@grupovalterraar | @grupovalterraar | Activa | 18/09/2026 | Gustavo (Owner) |
| X | https://x.com/grupovalterraar | @grupovalterraar | Activa | 02/08/2026 | Gustavo (Owner) |
| YouTube | https://www.youtube.com/@grupovalterra | @grupovalterra | Activa | 18/09/2026 | Gustavo (Owner) |

## Notas

- **TikTok — cambio CONSUMADO el 18/09/2026:** el username pasó de `@grupovalterra_ok` a
  `@grupovalterraar`. Lo confirmó el Owner y se verificó abriendo el perfil, que muestra
  "GRUPO VALTERRA / grupovalterraar". Ya está aplicado en `lib/social.ts`, en este documento
  y en `SOCIAL_CHANGELOG.md`. El handle viejo quedó libre: no enlazarlo nunca más.
- **Facebook — dos formas de la misma página:** la URL canónica del código es la corta por ID
  (la de la tabla). La forma larga `facebook.com/profile.php?id=61593004700771` redirige a la
  misma página y aparece a veces en capturas viejas; no es otra cuenta ni hay que migrarla.
  La página aún no tiene username propio: si algún día se reclama uno, actualizar PRIMERO
  `lib/social.ts` y después este documento.
- **YouTube** estaba en el código desde S20 y faltaba en esta tabla. Esa omisión es la que
  mantenía roja la guarda documental.
- La verificación del 02/08/2026 se hizo abriendo cada URL con la sesión del Owner
  (perfil propio con botón "Editar perfil" / vista de administrador en todas).
