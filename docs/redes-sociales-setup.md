# Configuración de redes sociales — Grupo Valterra

Kit de alta de cuentas: handles validados, textos listos para copiar y pegar, y el valor
exacto de cada campo de cada formulario. Está pensado para que quien complete el alta no
tenga que improvisar ningún dato.

Fuente de la identidad visual: `frontend/public/brand/`.

---

## 0. Datos maestros

Estos valores se repiten en todas las plataformas. Definirlos una sola vez evita
inconsistencias que después son difíciles de corregir (sobre todo el nombre legal y la
dirección, que Google y Meta usan para verificar).

| Dato | Valor |
| --- | --- |
| Nombre comercial | Grupo Valterra |
| Eslogan | Soluciones Inmobiliarias del Litoral |
| Categoría | Agencia inmobiliaria / Real Estate Agent |
| Sitio web | https://www.grupovalterra.com.ar |
| Teléfono / WhatsApp | ⚠️ **PENDIENTE** — ver sección 6 |
| Dirección física | ⚠️ **PENDIENTE** — ver sección 6 |
| Email de contacto | ⚠️ **PENDIENTE** — ver sección 6 |

### Paleta de marca

| Color | Hex | Uso |
| --- | --- | --- |
| Navy | `#0A2342` | Fondo de avatar, base de placas |
| Dorado | `#C9A86A` | Isotipo, acentos, subrayados |
| Off-white | `#F8F7F4` | Fondos claros, texto sobre navy |
| Verde | `#2E5E4E` | Acento secundario (eslogan) |

### Imágenes de perfil

- **Avatar (todas las redes):** `frontend/public/brand/avatar-social.svg` — isotipo dorado
  sobre navy, cuadrado 1024×1024. Exportar a PNG antes de subir; varias plataformas
  rechazan SVG.
- **No usar `logo-principal.svg` como avatar.** Es un lockup horizontal de 1200×320: en el
  recorte circular que aplican Instagram, Facebook y LinkedIn el texto queda cortado e
  ilegible. El lockup sirve para portadas, no para avatares.
- **Portada (Facebook 1640×856, LinkedIn 1128×191, YouTube 2048×1152):** lockup horizontal
  sobre fondo off-white, con margen generoso — LinkedIn y YouTube recortan mucho en mobile.

---

## 1. Handles — validación por plataforma

Cada red tiene reglas distintas de longitud y caracteres permitidos. `grupovalterra` son
13 caracteres y pasa en todas, así que es el candidato principal en todos lados. Las
alternativas propuestas **no** sirven en todas por igual:

| Plataforma | Límite | Caracteres | Handle propuesto | Estado |
| --- | --- | --- | --- | --- |
| Instagram | 30 | letras, números, `.` `_` | `grupovalterra` | ✅ válido |
| Facebook (página) | mín. 5 | letras, números, `.` | `grupovalterra` | ✅ válido |
| TikTok | 24 | letras, números, `.` `_` | `grupovalterra` | ✅ válido |
| LinkedIn (URL) | 5–100 | letras, números, `-` | `grupovalterra` | ✅ válido |
| YouTube (@handle) | 3–30 | letras, números, `.` `_` `-` | `grupovalterra` | ✅ válido |
| X / Twitter | **15** | letras, números, `_` **(sin puntos)** | `grupovalterra` | ✅ válido |
| Google Business | — | no usa handle | — | n/a |

### Si `@grupovalterra` está ocupado

El orden de preferencia que pediste funciona en casi todas, con dos excepciones que hay
que tener en cuenta:

1. `grupovalterra.ar` — ✅ Instagram, TikTok, YouTube. ❌ **X** (no admite puntos).
   ⚠️ **Facebook**: rechaza nombres de usuario que parecen dominios; `.ar` puede pasar,
   pero si lo bloquea usar `grupovalterra.arg`.
   ❌ **LinkedIn**: no admite puntos → usar `grupovalterra-ar`.
2. `grupovalterrainmobiliaria` — 25 caracteres. ✅ Instagram, LinkedIn, YouTube.
   ❌ **TikTok** (máx. 24, se pasa por 1). ❌ **X** (máx. 15).
3. `grupovalterra.corrientes` — 24 caracteres. ✅ Instagram, TikTok (justo en el límite),
   YouTube. ❌ **X**. ⚠️ LinkedIn con guion: `grupovalterra-corrientes`.

**Fallback para X**, donde ninguna alternativa de tu lista entra en 15 caracteres:
`grupovalterraar` (15) o `valterra_ar` (11). Decisión de marca pendiente — ver sección 6.

> **Recomendación:** reservá el handle en todas las plataformas *antes* de completar los
> perfiles, incluso en las que no vayas a usar activamente todavía. Reservar es gratis y
> recuperar un handle tomado por otro es prácticamente imposible.

---

## 2. Textos por plataforma (copiar y pegar)

### Instagram

**Nombre** (campo distinto al usuario; 30 caracteres máx., **es indexable por el buscador
de Instagram** — por eso lleva la palabra clave, no solo la marca):

```
Grupo Valterra | Inmobiliaria
```
*(29 caracteres)*

**Biografía** (150 caracteres máx.):

```
Soluciones Inmobiliarias del Litoral
🏡 Venta · Alquiler · Tasaciones
📍 Corrientes y alrededores
📲 Consultas por WhatsApp ⬇️
```
*(≈124 caracteres con saltos de línea)*

**Enlace:** `https://www.grupovalterra.com.ar`
**Categoría:** Agencia inmobiliaria
**Botones de acción:** WhatsApp, Cómo llegar, Correo electrónico

### Facebook (Página)

**Nombre de la página:** `Grupo Valterra`
**Categoría:** Agencia inmobiliaria
**Biografía corta** (101 caracteres máx.):

```
Soluciones Inmobiliarias del Litoral. Venta, alquiler y tasaciones en Corrientes.
```
*(80 caracteres)*

**Descripción larga:**

```
Grupo Valterra es una inmobiliaria del litoral argentino especializada en venta,
alquiler y tasación de propiedades. Acompañamos cada operación de principio a fin,
con asesoramiento profesional y un portfolio seleccionado de propiedades en
Corrientes y la región.

Consultá nuestro catálogo completo en www.grupovalterra.com.ar
```

### Google Business Profile

Es la ficha de mayor impacto comercial para una inmobiliaria: define si aparecés en
"inmobiliarias cerca mío" y en Google Maps. Priorizar esta por encima de las redes.

**Nombre:** `Grupo Valterra`
**Categoría principal:** Agencia inmobiliaria
**Categorías secundarias:** Agente inmobiliario, Tasador inmobiliario
**Descripción** (750 caracteres máx.):

```
Grupo Valterra es una inmobiliaria del litoral argentino dedicada a la venta,
el alquiler y la tasación de propiedades. Ofrecemos asesoramiento profesional
en cada etapa de la operación: valuación, comercialización, documentación y
cierre. Trabajamos con propiedades residenciales y comerciales en Corrientes y
la región del litoral.

Consultá el catálogo completo en www.grupovalterra.com.ar
```

**Área de servicio:** Corrientes Capital + localidades donde efectivamente operen.
**Atributos a activar:** "Ofrece servicios en el lugar", enlace a citas si aplica.

### LinkedIn (Página de empresa)

**Nombre:** `Grupo Valterra`
**Eslogan / tagline** (120 caracteres máx.):

```
Soluciones Inmobiliarias del Litoral | Venta, alquiler y tasaciones
```
*(66 caracteres)*

**Sector:** Bienes raíces
**Tamaño:** ⚠️ pendiente de confirmar
**Tipo:** Empresa privada

---

## 3. Orden de ejecución recomendado

El orden importa: Instagram y Facebook se vinculan a través de Meta Business Suite, y
hacerlo al revés obliga a rehacer pasos.

1. **Reservar handles** en las 6 plataformas (solo usuario y contraseña, sin completar
   perfil). Bloquea el nombre mientras armás el resto.
2. **Google Business Profile** — iniciar primero porque la verificación (video o postal)
   puede demorar días o semanas. Cuanto antes arranque, mejor.
3. **Facebook: crear la Página** desde una cuenta personal administradora.
4. **Instagram: crear la cuenta** y convertirla a *Cuenta de empresa*.
5. **Vincular** Instagram ↔ Página de Facebook desde Meta Business Suite.
6. **WhatsApp Business** — configurar y conectar al perfil de Instagram y a la Página.
7. **LinkedIn, TikTok, YouTube** — perfiles secundarios, sin urgencia.
8. **Sitio web** — agregar los enlaces a las redes en el footer y el `sameAs` del
   structured data (ver sección 5).

---

## 4. WhatsApp Business — advertencia importante

Un número de teléfono **no puede estar en WhatsApp personal y WhatsApp Business a la vez**.
Al migrar, la app personal deja de funcionar con ese número en ese dispositivo.

Antes de configurarlo, decidir:

- **Línea dedicada nueva** (recomendado): separa lo personal de lo comercial, permite que
  varias personas del equipo atiendan, y no arriesga el historial personal de nadie.
- **Migrar un número existente**: conserva los chats y los contactos que ya te escriben,
  pero quien sea dueño de ese número pierde su WhatsApp personal ahí.

---

## 5. Integración con el sitio

Una vez creadas las cuentas, los perfiles deben quedar enlazados desde el sitio en dos
lugares:

- **Footer** — íconos con enlace a cada red.
- **Structured data** — propiedad `sameAs` del schema `RealEstateAgent`, que le confirma a
  Google que esos perfiles y el sitio son la misma entidad. Es lo que consolida la ficha
  de Google Business con las redes.

```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "Grupo Valterra",
  "slogan": "Soluciones Inmobiliarias del Litoral",
  "url": "https://www.grupovalterra.com.ar",
  "sameAs": [
    "https://www.instagram.com/grupovalterra",
    "https://www.facebook.com/grupovalterra",
    "https://www.linkedin.com/company/grupovalterra"
  ]
}
```

Actualizar los handles reales una vez confirmados en el alta.

---

## 6. Pendientes — requieren definición

Ninguno de estos se puede inferir del repo ni de los datos entregados:

| # | Pendiente | Por qué bloquea |
| --- | --- | --- |
| 1 | **Teléfono / WhatsApp completo** | El dato llegó cortado (solo `+54`). Es campo obligatorio en Google Business, Instagram y Facebook. |
| 2 | **Dirección física** | Google Business exige dirección verificable o área de servicio declarada. Sin esto no hay ficha. |
| 3 | **Email corporativo** | Conviene dar de alta las cuentas con un mail de dominio (`contacto@grupovalterra.com.ar`), no uno personal: si mañana cambia quien administra, las cuentas no se pierden. |
| 4 | **Ciudad base** | Los textos asumen **Corrientes**, inferido de la alternativa `@grupovalterra.corrientes` que propusiste. Confirmar antes de publicar. |
| 5 | **Handle de X** | Ninguna de las alternativas propuestas entra en el límite de 15 caracteres. Decidir entre `grupovalterraar` o `valterra_ar` — o descartar X. |
| 6 | **Plataformas del alcance** | Este kit cubre Instagram, Facebook, Google Business, WhatsApp, LinkedIn, TikTok, YouTube y X. Confirmar cuáles entran realmente. |

---

## 7. Checklist de alta

```text
[ ] Handles reservados en las 6 plataformas
[ ] Avatar exportado a PNG 1024×1024 desde avatar-social.svg
[ ] Portadas generadas (FB 1640×856 · LI 1128×191 · YT 2048×1152)
[ ] Google Business Profile creado y verificación iniciada
[ ] Página de Facebook creada + nombre de usuario asignado
[ ] Instagram creado y convertido a Cuenta de empresa
[ ] Instagram ↔ Facebook vinculados en Meta Business Suite
[ ] WhatsApp Business configurado (número definido en pendiente #1)
[ ] Botones de acción activos en Instagram y Facebook
[ ] LinkedIn / TikTok / YouTube completados
[ ] Enlaces agregados al footer del sitio
[ ] sameAs actualizado en el structured data
[ ] Autenticación en dos pasos activada en todas las cuentas
```
