---
name: deploy-produccion
description: Procedimiento completo para hacer deploy a produccion (GitHub Pages). Usar cuando los cambios estan listos para publicar.
argument-hint: ""
---

# Deploy a Produccion — GitHub Pages

## Pre-requisitos
- Todos los cambios commiteados y pusheados a `main`
- Sin errores de TypeScript ni ESLint

## Procedimiento

### 1. Verificar estado limpio
```bash
git status
git log --oneline -5  # verificar ultimos commits
```

### 2. Build de produccion
```bash
cd apps/pwa
pnpm run build
```
Verificar que no hay errores de build.

### 3. Verificar build local (opcional)
```bash
pnpm run preview -- --port 4173
```
Abrir `http://localhost:4173/mantenimiento-planta/` y verificar.

### 4. Deploy a GitHub Pages
```bash
cd ../..  # raiz del proyecto
pnpm run deploy
```
Esto ejecuta `scripts/deploy.mjs` que:
- Copia `dist/` al branch `gh-pages`
- Pushea a GitHub

### 5. Verificar en produccion
Abrir `https://orelcain.github.io/mantenimiento-planta/`
- Verificar que la version en el footer/sidebar es la correcta
- Probar al menos 1 flujo critico (login, navegar modulo)

### 6. Actualizar version (si aplica)
Si fue un release significativo:
```bash
# Actualizar version en constants/version.ts
# Commit con mensaje: "release: vX.XX.X"
```

## Rollback
Si algo sale mal:
```bash
git log --oneline gh-pages -5  # ver commits anteriores
git push origin HEAD~1:gh-pages --force  # revertir al anterior
```
