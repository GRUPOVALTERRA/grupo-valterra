# Requisitos de piezas gráficas — Grupo Valterra

## Paleta de marca

| Color | Hex | Uso |
| --- | --- | --- |
| Navy | #0A2342 | Fondo de avatar, base de placas |
| Dorado | #C9A86A | Isotipo, acentos |
| Off-white | #F8F7F4 | Fondos claros, texto sobre navy |
| Verde | #2E5E4E | Acento secundario |

## Formatos y tamaños recomendados

| Pieza | Relación | Tamaño |
| --- | --- | --- |
| Avatar (todas las redes) | 1:1 | 1024×1024 px |
| Post feed IG/FB | 4:5 | 1080×1350 px |
| Post cuadrado | 1:1 | 1080×1080 px |
| Historia / Reel / TikTok | 9:16 | 1080×1920 px |
| Portada Facebook | ~1.91:1 | 1640×856 px |
| Video | 9:16 vertical | ≤60 s para Reels/TikTok |

- **Logo:** usar los archivos de `frontend/public/brand/` (isotipo y lockup). No deformar,
  no recolorear fuera de paleta, margen de seguridad ≥10% del lado menor.
- **Fotos:** horizontales para feed 4:5 recortable; sin datos sensibles visibles (ver checklist).
- **Video:** subtítulos SIEMPRE (mucha reproducción sin audio).
- **Alt text:** describir la propiedad/imagen en cada publicación que lo permita.
- **Originales:** conservar los archivos fuente (fotos RAW/alta, proyectos de edición) fuera
  del repo, en el almacenamiento del Owner; al repo solo van assets finales livianos.

## Avatar oficial (fuente editable)

El avatar 1024×1024 en uso (V dorada sobre navy) sale de este SVG. El PNG exportado vive en
la branch histórica `claude/grupo-valterra-social-setup-qrqpj5` (pendiente de rescate como
binario); las cuentas ya lo tienen subido.

```svg
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0A2342"/>
  <g transform="translate(127 92) scale(3.5)">
    <path d="M48 52 L110 176 L172 52" fill="none" stroke="#C9A86A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M75 52 L110 122 L145 52" fill="none" stroke="#F8F7F4" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
    <line x1="58" y1="188" x2="162" y2="188" stroke="#C9A86A" stroke-width="8" stroke-linecap="round" opacity="0.9"/>
  </g>
</svg>
```
