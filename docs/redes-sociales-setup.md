# Configuración de redes sociales — Grupo Valterra

Kit de alta de cuentas: handles validados, textos listos para copiar y pegar, y el valor
exacto de cada campo de cada formulario. Está pensado para que quien complete el alta no
tenga que improvisar ningún dato.

Fuente de la identidad visual: `frontend/public/brand/`.

---

## 0. Datos maestros

Estos valores se repiten en todas las plataformas. Definirlos una sola vez evita
inconsistencias que después son difíciles de corregir — sobre todo nombre, dirección y
teléfono, que Google y Meta cruzan entre sí para verificar el negocio. Deben coincidir
**carácter por carácter** en todas las fichas.

| Dato | Valor |
| --- | --- |
| Nombre comercial | Grupo Valterra |
| Eslogan | Soluciones Inmobiliarias del Litoral |
| Categoría | Agencia inmobiliaria / Real Estate Agent |
| Sitio web | https://www.grupovalterra.com.ar |
| Teléfono / WhatsApp | +54 9 379 515-9096 |
| Dirección | Catamarca 1365, Piso 1° Dpto. I, Corrientes Capital |
| Ciudad base | Corrientes Capital |
| Zona de cobertura | Entre Ríos, Corrientes, Chaco y Misiones |
| Email administrativo | grupovalterraservinmob@gmail.com (2FA activa) |
| Admin de Página FB | Gustavo Zacarias (cuenta personal) |

> ⚠️ **Riesgo de titularidad del email.** Las cuentas se dan de alta con un Gmail personal,
> no con un correo del dominio propio. Si mañana cambia quien administra, la recuperación
> de todas las cuentas depende de ese Gmail. Migrar a `contacto@grupovalterra.com.ar`
> **antes** de dar de alta es mucho más barato que migrar después: Google Business en
> particular obliga a un traspaso de propiedad con espera de varios días. Decisión
> pendiente.

### Paleta de marca

| Color | Hex | Uso |
| --- | --- | --- |
| Navy | `#0A2342` | Fondo de avatar, base de placas |
| Dorado | `#C9A86A` | Isotipo, acentos, subrayados |
| Off-white | `#F8F7F4` | Fondos claros, texto sobre navy |
| Verde | `#2E5E4E` | Acento secundario (eslogan) |

### Imágenes de perfil

- **Avatar (todas las redes):** `frontend/public/brand/avatar-social.png` — 1024×1024,
  isotipo dorado sobre navy, **listo para subir**. La V queda dentro del área segura del
  recorte circular que aplican Instagram, Facebook y LinkedIn.
- **Fuente editable:** `avatar-social.svg`, por si hay que regenerarlo en otro tamaño.
- **No usar `logo-principal.svg` como avatar.** Es un lockup horizontal de 1200×320: en el
  recorte circular el texto queda cortado e ilegible. El lockup sirve para portadas.
- **Portadas (Facebook 1640×856, LinkedIn 1128×191, YouTube 2048×1152):** lockup horizontal
  sobre fondo off-white, con margen generoso — LinkedIn y YouTube recortan mucho en mobile.

---

## 1. Handles — validación por plataforma

`grupovalterra` son 13 caracteres y pasa las reglas de todas las plataformas, así que es el
candidato principal en todos lados.

| Plataforma | Límite | Caracteres | Handle | Estado |
| --- | --- | --- | --- | --- |
| Instagram | 30 | letras, números, `.` `_` | `grupovalterra` | ✅ |
| Facebook (página) | mín. 5 | letras, números, `.` | `grupovalterra` | ✅ |
| TikTok | 24 | letras, números, `.` `_` | `grupovalterra` | ✅ |
| LinkedIn (URL) | 5–100 | letras, números, `-` | `grupo-valterra` | ✅ |
| YouTube (@handle) | 3–30 | letras, números, `.` `_` `-` | `grupovalterra` | ✅ |
| X / Twitter | **15** | letras, números, `_` **(sin puntos)** | `grupovalterra` | ✅ |
| Google Business | — | no usa handle | — | n/a |

### Fallbacks si `@grupovalterra` está ocupado

| Plataforma | Fallback | Nota |
| --- | --- | --- |
| Instagram | `grupovalterra_ok` → `grupovalterra.corrientes` | ambos válidos |
| Facebook | `grupovalterra_ok` → `grupovalterra.corrientes` | Facebook rechaza usuarios que parezcan dominios; `.corrientes` es seguro |
| TikTok | `grupovalterra_ok` → `grupovalterra.corrientes` (24, justo en el límite) | |
| LinkedIn | `grupo-valterra-corrientes` | **sin puntos**, LinkedIn solo admite guiones |
| X | `grupovalterraar` (15) → `valterra_ar` (11) | ver abajo |

**Verificado — `grupovalterrainmobiliaria` no sirve en TikTok:** son 25 caracteres contra un
límite de 24. Se pasa por uno. Usar `grupovalterra`.

**Verificado — X no admite ninguna variante con punto** y `grupovalterrainmobiliaria` (25)
se pasa del límite de 15. Los únicos fallbacks viables son `grupovalterraar` o
`valterra_ar`. Si ambos están tomados, la decisión de marca es abrir X con otro nombre o
directamente no abrir X — es la red de menor peso para una inmobiliaria local.

> **Recomendación:** reservá el handle en todas las plataformas *antes* de completar los
> perfiles, incluso en las que no vayas a usar todavía. Reservar es gratis; recuperar un
> handle tomado por otro es prácticamente imposible.

---

## 2. Textos por plataforma (copiar y pegar)

### Google Business Profile

Es la ficha de mayor impacto comercial para una inmobiliaria: define si aparecés en
"inmobiliarias cerca mío" y en Maps. **Prioridad 1.**

**Nombre:** `Grupo Valterra`
**Categoría principal:** Agencia inmobiliaria
**Categorías secundarias:** Agente inmobiliario, Tasador inmobiliario
**Dirección:** `Catamarca 1365, Piso 1° Dpto. I, Corrientes Capital, Corrientes`
**Teléfono:** `+54 9 379 515-9096`
**Sitio:** `https://www.grupovalterra.com.ar`

**Descripción** (750 caracteres máx.):

```
Grupo Valterra es una empresa especializada en transacciones inmobiliarias que
ofrece asesoramiento personalizado para propiedades en la región noreste de
Argentina (litoral), con presencia en Paraná, Corrientes, Posadas y Resistencia.

Compra, venta, alquiler y alquiler temporal de propiedades residenciales y
comerciales. Acompañamos cada operación de principio a fin: valuación,
comercialización, documentación y cierre.

Consultá el catálogo completo en www.grupovalterra.com.ar
```

**Áreas de servicio:** Corrientes, Chaco, Entre Ríos, Misiones.

⚠️ **Dos cosas a prever en la verificación:**

1. La dirección es una **oficina en piso 1°**. Google suele resolver estos casos con
   verificación por video, no por postal: piden mostrar cartelería visible con el nombre
   del negocio, el acceso desde la calle y el interior de la oficina. Conviene tener
   cartel en la puerta *antes* de iniciar el trámite — sin señalización identificable, la
   verificación se rechaza y el reintento demora semanas.
2. Declarar **cuatro provincias enteras** como área de servicio es válido, pero Google
   pondera la cercanía: una ficha con área muy amplia rankea peor en su propia ciudad. Si
   el grueso de las operaciones es en Corrientes Capital, conviene declarar localidades
   concretas en lugar de provincias completas.

### Facebook (Página)

**Nombre:** `Grupo Valterra`
**Categoría:** Agencia inmobiliaria
**Usuario:** `@grupovalterra`

⚠️ **La Página tiene dos campos de texto distintos y el texto largo no entra en el corto.**

**Bio** (límite **101 caracteres** — es el que se ve bajo el nombre):

```
Soluciones Inmobiliarias del Litoral 🏡 Compra, venta y alquiler en Corrientes.
```
*(78 caracteres)*

**Acerca de / Descripción** (campo largo):

```
Soluciones Inmobiliarias del Litoral 🏡
Compra, venta, alquiler y alquiler temporal de propiedades en Entre Ríos, Corrientes, Chaco y Misiones. Asesoramiento personalizado para inversiones inmobiliarias.
📍 Catamarca 1365, Corrientes Capital
📞 +54 9 379 515-9096
🌐 www.grupovalterra.com.ar
```

**Botón de acción:** WhatsApp → `+54 9 379 515-9096`

### Instagram

**Nombre** (campo distinto al usuario; 30 caracteres máx., **es indexable por el buscador
de Instagram** — por eso lleva la palabra clave, no solo la marca):

```
Grupo Valterra | Inmobiliaria
```
*(29 caracteres)*

**Biografía** (150 caracteres máx.):

```
🏡 Soluciones Inmobiliarias del Litoral
📍 Entre Ríos | Corrientes | Chaco | Misiones
📲 +54 9 379 515-9096
👇 Consultá tu propiedad
```
*(≈129 caracteres con saltos de línea)*

**Enlace:** `https://www.grupovalterra.com.ar`
**Categoría:** Agencia inmobiliaria
**Botones de acción:** WhatsApp, Cómo llegar, Correo electrónico

### TikTok

**Biografía** (80 caracteres máx.):

```
🏡 Inmobiliaria del Litoral | Compra, venta y alquiler | Corrientes, Arg
```
*(71 caracteres — entra)*

**Enlace:** `https://www.grupovalterra.com.ar`
*(el campo de sitio web se habilita recién al pasar a cuenta de empresa)*

### Meta Business Suite

**Descripción del negocio:**

```
Grupo Valterra es una empresa especializada en transacciones inmobiliarias que
ofrece asesoramiento personalizado para propiedades en la región noreste de
Argentina (litoral), con presencia en Paraná, Corrientes, Posadas y Resistencia.
```

**Dirección, teléfono y sitio:** los de la sección 0, idénticos a los de Google Business.

### LinkedIn (Página de empresa)

**Nombre:** `Grupo Valterra`
**URL:** `linkedin.com/company/grupo-valterra`
**Eslogan** (120 caracteres máx.):

```
Soluciones Inmobiliarias del Litoral | Compra, venta y alquiler en Entre Ríos, Corrientes, Chaco y Misiones
```
*(106 caracteres)*

**Sector:** Bienes raíces · **Tipo:** Empresa privada

### X / Twitter

**Bio** (160 caracteres máx.):

```
🏡 Soluciones Inmobiliarias del Litoral. Compra, venta y alquiler en Entre Ríos, Corrientes, Chaco y Misiones. 📍 Corrientes Capital
```
*(130 caracteres)*

---

## 3. Orden de ejecución

1. **Google Business Profile** — iniciar primero: la verificación puede demorar semanas y
   define la aparición en Maps y en búsquedas locales.
2. **Página de Facebook** — completar foto, portada, bio corta, descripción y contacto.
3. **Instagram** — convertir a cuenta de empresa, vincular a la Página, cargar bio y link.
4. **TikTok** — convertir a cuenta de empresa, cargar bio, foto y link.
5. **Meta Business Suite** — vincular Facebook + Instagram, cargar datos, dejar iniciada la
   verificación del negocio.
6. **X y LinkedIn** — con los handles de la sección 1.
7. **Sitio web** — enlaces en el footer y `sameAs` del structured data (sección 5).

---

## 4. WhatsApp Business — decisión pendiente

Un número **no puede estar en WhatsApp personal y WhatsApp Business a la vez**. Al migrar
`+54 9 379 515-9096`, la app personal deja de funcionar con ese número en ese equipo.

Confirmar con el dueño del teléfono antes de migrar:

- **Línea dedicada nueva** (recomendado): separa lo personal de lo comercial, permite que
  varias personas atiendan, y no arriesga el historial personal de nadie.
- **Migrar el número actual**: conserva los chats y contactos existentes, pero su dueño
  pierde el WhatsApp personal en ese equipo.

Si se migra, hacerlo **antes** de cargar el botón de WhatsApp en Instagram y Facebook, para
no publicar un número que después cambia.

---

## 5. Integración con el sitio

- **Footer** — íconos con enlace a cada red.
- **Structured data** — `sameAs` del schema `RealEstateAgent`, que le confirma a Google que
  esos perfiles y el sitio son la misma entidad. Es lo que consolida la ficha de Google
  Business con las redes.

```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "Grupo Valterra",
  "slogan": "Soluciones Inmobiliarias del Litoral",
  "url": "https://www.grupovalterra.com.ar",
  "telephone": "+5493795159096",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Catamarca 1365, Piso 1° Dpto. I",
    "addressLocality": "Corrientes",
    "addressRegion": "Corrientes",
    "addressCountry": "AR"
  },
  "areaServed": ["Corrientes", "Chaco", "Entre Ríos", "Misiones"],
  "sameAs": [
    "https://www.instagram.com/grupovalterra",
    "https://www.facebook.com/grupovalterra",
    "https://www.linkedin.com/company/grupo-valterra"
  ]
}
```

Actualizar los handles reales una vez confirmados en el alta.

---

## 6. Pendientes de decisión

| # | Pendiente | Por qué importa |
| --- | --- | --- |
| 1 | **Email de dominio propio** | Dar de alta con Gmail personal ata la recuperación de todas las cuentas a ese buzón. Migrar después cuesta mucho más que hacerlo ahora. |
| 2 | **Número de WhatsApp Business** | Línea nueva vs. migrar la actual (sección 4). Bloquea los botones de acción de Instagram y Facebook. |
| 3 | **Cartelería en la oficina** | Sin señalización visible, la verificación por video de Google Business se rechaza. |
| 4 | **Alcance del área de servicio en Google** | Cuatro provincias enteras vs. localidades concretas (sección 2). |
| 5 | **Handle de X si los fallbacks están tomados** | Decidir nombre alternativo o no abrir X. |

---

## 7. Checklist de alta

```text
[ ] Handles reservados en todas las plataformas
[ ] Avatar avatar-social.png subido en todas las cuentas
[ ] Portadas generadas (FB 1640×856 · LI 1128×191 · YT 2048×1152)
[ ] Google Business Profile creado y verificación iniciada
[ ] Página de Facebook completa + nombre de usuario asignado
[ ] Instagram convertido a Cuenta de empresa
[ ] Instagram ↔ Facebook vinculados en Meta Business Suite
[ ] TikTok convertido a cuenta de empresa
[ ] WhatsApp Business definido y configurado
[ ] Botones de acción activos en Instagram y Facebook
[ ] LinkedIn / X completados
[ ] Enlaces agregados al footer del sitio
[ ] sameAs actualizado en el structured data
[ ] 2FA activada en todas las cuentas
```
