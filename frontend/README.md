# GRUPO VALTERRA - Servicios Inmobiliarios del Litoral

Repositorio base para el desarrollo de la plataforma **GRUPO VALTERRA**, una solución web de servicios inmobiliarios orientada a marketplace, gestión de propiedades, contactos comerciales y experiencia de usuario premium.

## Objetivo del proyecto

Construir una plataforma inmobiliaria moderna, escalable y segura, inspirada en buenas prácticas de portales internacionales de alto prestigio, adaptada al mercado del Litoral argentino.

## Estructura del repositorio

```text
grupo-valterra/
├── README.md
├── .gitignore
├── docs/
│   ├── arquitectura.md
│   ├── convencion-ramas.md
│   └── roadmap.md
├── src/
│   ├── frontend/
│   ├── backend/
│   └── shared/
├── public/
├── config/
├── scripts/
├── tests/
└── .github/
    ├── workflows/
    │   └── ci.yml
    └── ISSUE_TEMPLATE/
        ├── bug_report.md
        └── feature_request.md
```

## Ramas principales

- `main`: rama estable de producción.
- `dev`: rama de integración y pruebas.
- `feature/nombre-funcionalidad`: nuevas funcionalidades.
- `fix/nombre-error`: correcciones de errores.
- `hotfix/nombre-urgente`: correcciones urgentes sobre producción.
- `release/version`: preparación de versiones.

## Flujo recomendado

1. Crear una rama desde `dev`.
2. Desarrollar la funcionalidad o corrección.
3. Hacer commits claros y pequeños.
4. Crear Pull Request hacia `dev`.
5. Revisar, probar y aprobar.
6. Integrar `dev` a `main` solo cuando esté estable.

## Convención de commits

Se recomienda usar Conventional Commits:

```text
feat: agregar buscador de propiedades
fix: corregir validación de formulario de contacto
docs: actualizar roadmap inicial
style: ajustar diseño visual de cards
refactor: reorganizar módulo de propiedades
test: agregar pruebas de filtros
chore: actualizar configuración del proyecto
```

## Estado inicial

Proyecto en etapa base: definición de arquitectura, identidad visual, estructura técnica y planificación del MVP.

## Equipo

- Dirección estratégica: GRUPO VALTERRA
- Desarrollo técnico: pendiente de asignación
- Diseño UX/UI: pendiente de asignación
- Backend/API: pendiente de definición tecnológica
- Frontend/Web: pendiente de definición tecnológica

