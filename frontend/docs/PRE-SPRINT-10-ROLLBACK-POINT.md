# Pre-Sprint 10 · Rollback Point · Grupo Valterra

> Punto de rollback total atómico antes de Sprint 10 (Multi-Tenant Foundation). 1 comando para volver al estado actual si algo sale mal.

## Por qué

Sprint 10 toca DB (FK + RLS multi-tenant), auth (Supabase Auth + magic link), middleware (refresh de session) y admin scoping. Es la ventana de mayor riesgo del año. Tener un punto git inmutable y conocido permite:

1. Rollback total a un SHA específico sin reconstruir nada a mano.
2. Comparar estados (`git diff v0.3.0-pre-sprint-10 main`) durante el sprint.
3. Identificar regresiones específicas (`git bisect`).
4. Reportar incidents con referencia clara ("Sprint 10 introdujo este bug a partir de tag X").

---

## Acción: crear y pushear el tag

Ejecutar en tu PC, dentro del repo Valterra (en cualquier directorio del repo, no necesita ser `frontend/`):

```bash
cd C:\Users\gust\Downloads\grupo-valterra-repo

# 1. Confirmar que estás parado en main y al día
git checkout main
git pull origin main

# 2. Verificar que el HEAD actual corresponde al cierre Sprint 9.5 + CSP enforce
git log -1 --oneline
# Debería mostrar algo como: "abc1234 feat(sprint-9.5): production hardening..."
# o el commit del CSP enforce

# 3. Crear tag anotado (preferible a tag liviano)
git tag -a v0.3.0-pre-sprint-10 -m "Pre-Sprint 10 rollback point.

Estado: Sprint 9.5 cerrado + CSP enforce activo.
Próximo: Sprint 10 · Multi-Tenant Foundation (MF1-MF6).

Componentes confirmados estables:
- Properties reales desde Supabase con fallback memoria
- /api/properties + /propiedades/[slug] SSR + SEO dinámica
- /api/contact con honeypot + rate limit + Resend notifications
- Admin auth via cookie ADMIN_TOKEN (a deprecar Sprint 10)
- Security headers OWASP basics (CSP enforce)
- Sentry minimal MVP capturando errors
- /api/health enriched (commit SHA + region + sentry status)
- agency_id canónico en leads y properties

Rollback: git reset --hard v0.3.0-pre-sprint-10"

# 4. Push del tag al remote
git push origin v0.3.0-pre-sprint-10

# 5. Verificar
git tag -l "v0.3.0*"
# Debería listar: v0.3.0-pre-sprint-10
```

---

## Cómo rollback si Sprint 10 sale mal

Tres niveles de rollback, del menos agresivo al más agresivo.

### Nivel 1 · Rollback de deploy (sin tocar git)

Si el último deploy en Vercel rompió producción:

1. Vercel dashboard → **Deployments**.
2. Buscar el último deploy verde **anterior** al problemático.
3. Click los **3 puntitos** (⋯) a la derecha → **Promote to Production**.
4. En 5 segundos producción vuelve a la versión anterior.

Tarda menos que abrir el editor. Es el primer recurso ante cualquier incident producción.

**Limitación:** rollback de Vercel no revierte cambios de DB ni env vars.

### Nivel 2 · Rollback parcial vía revert

Si rompió una micro-fase específica (ejemplo: MF3 introduce bug de auth):

```bash
git checkout main

# Identificar el commit de la MF problemática
git log --oneline | head -20

# Revertir ese commit creando uno inverso
git revert <SHA-de-la-MF>

# Push - dispara redeploy auto en Vercel
git push origin main
```

Preserva todos los otros MF deployados. Atómico y revisable.

### Nivel 3 · Rollback total a pre-Sprint 10

Si Sprint 10 está roto en varios MF y queremos volver al estado base:

```bash
git checkout main

# Reset hard al tag (DESTRUCTIVO - perdés commits posteriores)
git reset --hard v0.3.0-pre-sprint-10

# Force push - solo si nadie más está pusheando en main
git push --force-with-lease origin main
```

**IMPORTANTE — Antes del nivel 3:**

1. Crear branch backup del estado actual por si querés rescatar algo después:
   ```bash
   git branch backup/sprint-10-attempt-1 main
   git push origin backup/sprint-10-attempt-1
   ```

2. Rollback DB de las migraciones Sprint 10 aplicadas. Cada migration tiene su SQL inverso en el header del archivo. Ejecutar en Supabase Studio SQL Editor **en orden inverso**:
   - Rollback `0006_invitations.sql` (si se aplicó)
   - Rollback `0005_fk_rls_backfill.sql`
   - Rollback `0004_agencies_and_members.sql`

3. Limpiar env vars Sprint 10 en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` (queda — sigue siendo válida)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (queda — sigue siendo válida)
   - Cualquier env nueva específica de invites o feature flags

4. Vercel re-deploya automático desde main reseteado. Verificar `/api/health` y `/admin/leads` funcionan con el ADMIN_TOKEN viejo.

---

## Pre-flight checklist antes del tag

Antes de ejecutar el `git tag` arriba, verificar:

- [ ] Sprint 9.5 mergeado a `main` y deployado a producción
- [ ] `https://grupo-valterra.vercel.app/api/health` retorna `status: ok`
- [ ] CSP enforce switch incluido (`next.config.ts` línea 32 dice `"Content-Security-Policy"` sin `-Report-Only`)
- [ ] UptimeRobot ya monitorando (al menos 30 min de Up estable)
- [ ] `git status` limpio en main (`nothing to commit`)
- [ ] `npm run typecheck` PASS en main
- [ ] `npm run lint` PASS en main (0 errors, 3 warnings pre-existentes esperados)

Si los 7 ítems están ✓ → ejecutar `git tag` arriba sin miedo.

---

## Cómo verificar que el tag quedó bien

```bash
# Ver el tag local
git show v0.3.0-pre-sprint-10 --stat

# Ver el tag en el remote (GitHub)
git ls-remote --tags origin | grep v0.3.0

# En GitHub: https://github.com/<owner>/<repo>/tags
# Debería listar v0.3.0-pre-sprint-10 con el mensaje completo
```

---

## Naming convention para futuros tags

Mantener consistencia:

- `v0.3.0-pre-sprint-10` · este tag
- `v0.4.0-pre-sprint-11` · después de cerrar Sprint 10
- `v0.5.0-pre-sprint-12` · después de Sprint 11
- `v1.0.0` · primera release pública estable con dominio propio
- `v1.0.0-rc.1` · release candidate

Cada sprint cierra con un tag = snapshot inmutable de "esto fue lo que entregamos".

---

## Sprint 10 OK criterion

Antes de empezar Sprint 10 MF1:
- [ ] Tag `v0.3.0-pre-sprint-10` existe en `git tag -l`
- [ ] Tag está en el remote (`git ls-remote --tags origin`)
- [ ] Tag fue creado **después** de aplicar CSP enforce
- [ ] Tag fue creado **después** de confirmar UptimeRobot estable
