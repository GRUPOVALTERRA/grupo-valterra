# Convención de ramas

## Ramas permanentes

### main
Rama estable. Representa el código listo para producción.

Reglas:
- No se trabaja directamente sobre `main`.
- Solo recibe merges aprobados desde `dev` o `hotfix/*`.
- Debe estar siempre desplegable.

### dev
Rama de integración. Reúne funcionalidades terminadas y en prueba.

Reglas:
- Toda nueva funcionalidad debe integrarse primero en `dev`.
- Puede contener cambios aún no productivos.
- Debe probarse antes de promover a `main`.

## Ramas temporales

### feature/nombre-funcionalidad
Para nuevas funcionalidades.

Ejemplos:
- `feature/buscador-propiedades`
- `feature/ficha-inmueble`
- `feature/contacto-whatsapp`

### fix/nombre-error
Para correcciones normales.

Ejemplos:
- `fix/error-filtro-precio`
- `fix/formulario-contacto`

### hotfix/nombre-urgente
Para correcciones urgentes en producción.

Ejemplos:
- `hotfix/error-login-produccion`
- `hotfix-caida-home`

### release/version
Para preparar una versión antes de producción.

Ejemplos:
- `release/v1.0.0`
- `release/mvp-inicial`

## Flujo de trabajo recomendado

```bash
git checkout dev
git pull origin dev
git checkout -b feature/nombre-funcionalidad
```

Al finalizar:

```bash
git add .
git commit -m "feat: describir cambio realizado"
git push origin feature/nombre-funcionalidad
```

Luego crear Pull Request hacia `dev`.
