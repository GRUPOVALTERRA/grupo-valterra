# Storage MVP Notes · Sprint 11 MF1

## Bucket configuration (Supabase Studio)

- **Name:** `properties`
- **Visibility:** PUBLIC
- **MIME whitelist:** `image/jpeg`, `image/png`, `image/webp`
- **Max file size:** 5 MB

## Public bucket policy (explicit)

- Bucket is **public** → URLs are anon-GET fetchable.
- Only paths destined to **published** properties should receive uploads from these helpers.
- URLs are NOT private — security relies on UUID obscurity (path includes `agency_id` + `property_id` UUIDs v4).
- Signed URLs / draft handling: **deferred** to a future sprint.

## Scope MF1

- Primitive only: `upload → validate → store → return { path, publicUrl }`
- Manual smoke test via Node REPL.
- NO DB persistence, NO UI, NO admin wiring, NO migrations.

## Path convention

| Image kind | Path |
|---|---|
| Cover | `<agency_id>/<property_id>/cover.webp` |
| Gallery item | `<agency_id>/<property_id>/gallery/<NN>.webp` (NN = `00`..`99`) |

## MF1 known limitations

- Files are stored with `.webp` extension regardless of input MIME.
- Actual bytes match input MIME (no server-side conversion in MF1).
- Client-side canvas resize + true webp conversion: deferred to MF4.

## Cleanup

- Orphan files: manual review via Supabase Studio.
- No automatic GC in MF1.
- On future property delete: caller must iterate folder + remove files BEFORE deleting row (no CASCADE between Storage and DB).

## Rollback

1. Git: `git reset --hard v0.4.0-post-sprint-10-core-locked && git push --force-with-lease origin main`
2. Vercel: Promote previous deploy.
3. Supabase: Studio → Storage → `properties` → delete files → delete bucket.

## Promotion status (OS v1 L2)

- `src/lib/storage.ts` helpers: **CORE candidate**. Promotion to `src/platform/storage/` deferred until 2nd consumer (e.g. PatiFeliz image upload).
- `src/services/properties-storage.ts`: vertical (real estate specific). Stays in `src/services/`.

## Smoke test procedure

### Pre-smoke (Supabase Studio · sin código)

1. Storage tab → confirmar bucket `properties` existe + Public ON
2. Upload manual de `public/brand/og-default.jpg` vía Studio UI
3. Copy public URL → browser incognito → imagen carga
4. Delete archivo test

### Code smoke (Node REPL post-implementación)

```bash
cd C:\Users\gust\Downloads\grupo-valterra-repo\frontend

# Obtener UUID Valterra desde Supabase SQL Editor:
#   select id from agencies where slug = 'valterra';

# Reemplazar <UUID-VALTERRA> y ejecutar:
node --input-type=module -e "
  import('./src/services/properties-storage.ts').then(async ({ uploadPropertyImage }) => {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile('./public/brand/og-default.jpg');
    const file = new File([buf], 'test.jpg', { type: 'image/jpeg' });
    const r = await uploadPropertyImage({
      agencyId: '<UUID-VALTERRA>',
      propertyId: 'mf1-smoke-' + Date.now(),
      kind: 'cover',
      file,
    });
    console.log(r);
  }).catch(console.error);
"
```

Expected output:

```
{
  ok: true,
  path: '<uuid-valterra>/mf1-smoke-XXXX/cover.webp',
  publicUrl: 'https://<project>.supabase.co/storage/v1/object/public/properties/<uuid-valterra>/mf1-smoke-XXXX/cover.webp'
}
```

### Validation checklist

- [ ] Output muestra `{ ok: true, path, publicUrl }`
- [ ] Browser GET de `publicUrl` carga imagen
- [ ] Studio → properties → archivo visible en path correcto
- [ ] `/api/health` sigue `status: ok`
- [ ] `npm run typecheck` 0 errors
- [ ] `npm run lint` 0 errors · 3 warnings pre-existentes
- [ ] `/propiedades/casa-frente-rio-parana` imágenes Unsplash siguen cargando
- [ ] DevTools Console sin errores CSP nuevos

### Cleanup post-smoke

Studio → properties → borrar todos los paths `mf1-smoke-*` para dejar bucket limpio.
