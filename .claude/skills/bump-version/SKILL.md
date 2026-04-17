---
name: bump-version
description: Bumps the app version across all 3 sync files (version.ts, package.json, version.json) and updates the "Version actual" section in CLAUDE.md. Run at the end of every session that includes shippable features. Accepts optional argument "MAJOR.MINOR.PATCH" to override auto-increment, otherwise increments minor by 1.
argument-hint: "e.g. 2.95.0 (optional — omit to auto-increment minor)"
---

# bump-version — Sincronizar versión en 3 archivos + CLAUDE.md

Ejecutar al final de sesiones con features nuevas antes del commit final de docs.

---

## Paso 0: Leer versión actual

```bash
grep "APP_VERSION" apps/pwa/src/constants/version.ts
```

Si se pasó un argumento (ej: `2.95.0`), usarlo como nueva versión.
Si no, incrementar el número de **minor** en 1. Ejemplos:
- `2.93.0` → `2.94.0`
- `2.94.2` → `2.95.0` (siempre reset patch a 0 al incrementar minor)

## Paso 1: Pedir nombre de la versión

Si no se proporcionó como argumento, preguntar al usuario:
> ¿Cómo resumirías los cambios de esta versión en una frase corta? (será el VERSION_NAME)

Formato sugerido: `feat(scope): descripción breve` o `fix(scope): descripción breve`

## Paso 2: Actualizar apps/pwa/src/constants/version.ts

Editar los 3 campos:
```ts
export const APP_VERSION = 'X.Y.Z' as const
export const VERSION_DATE = 'YYYY-MM-DD' as const   // fecha de hoy
export const VERSION_NAME = '<nombre dado en Paso 1>' as const
```

**Importante**: No tocar VERSION_INFO — se auto-computa.

## Paso 3: Actualizar apps/pwa/package.json

Cambiar solo el campo `"version"` del JSON raíz del paquete:
```json
"version": "X.Y.Z"
```

Usar `jq` o editar directamente. Verificar que sea el campo top-level, no el de dependencias.

```bash
# Verificar antes de editar:
grep -n '"version"' apps/pwa/package.json | head -3
```

## Paso 4: Actualizar apps/pwa/public/version.json

Actualizar `version`, `buildDate` y `buildTimestamp`:
```json
{
  "version": "X.Y.Z",
  "buildDate": "YYYY-MM-DD",
  "buildTimestamp": <epoch_ms_actual>,
  "features": ["<resumen de los cambios principales, 1-3 bullets>"]
}
```

Para obtener el timestamp actual:
```bash
node -e "console.log(Date.now())"
```

El campo `features` debe listar las 1-3 novedades más visibles de la versión.

## Paso 5: Actualizar CLAUDE.md — sección "Version actual"

Localizar y editar la línea:
```
- **vX.Y.Z** (YYYY-MM-DD) — "descripción previa"
```

Reemplazar con:
```
- **vX.Y.Z** (YYYY-MM-DD) — "<VERSION_NAME>"
```

## Paso 6: Verificar sincronía

```bash
grep "APP_VERSION\|VERSION_DATE\|VERSION_NAME" apps/pwa/src/constants/version.ts
grep '"version"' apps/pwa/package.json | head -1
cat apps/pwa/public/version.json | grep '"version"\|"buildDate"'
grep "Version actual" CLAUDE.md -A 1
```

Los 4 deben mostrar la misma versión y fecha.

## Paso 7: Reportar al usuario

Mostrar resumen:
```
✅ Versión bumpeada: vX.Y-1.Z → vX.Y.Z
   version.ts     → APP_VERSION + VERSION_NAME + VERSION_DATE
   package.json   → "version"
   version.json   → version + buildDate + buildTimestamp + features
   CLAUDE.md      → "Version actual"
```

---

## Notas

- Este skill NO hace commit — el commit lo hace `cerrar-sesion` en el Paso 5.
- Si la sesión no tiene features shipiables (solo docs, typos, experimentos), no es necesario bumpar.
- El número de PATCH se usa para hotfixes en producción. En sesiones normales siempre incrementar MINOR.
- `version.json` es leído por el service worker para invalidar caché al actualizar la app.
