---
name: audit-unused-locals
description: Detectar y eliminar variables, funciones e imports declarados pero no usados tras un refactor grande. Previene fallos CI por noUnusedLocals/noUnusedParameters. Usar antes de pushear a main cuando se eliminó código sustancial.
argument-hint: "<archivo o directorio a auditar>"
---

# Audit Unused Locals — Limpieza post-refactor

Cuando se elimina código sustancial (drag handlers, secciones enteras, tabs), es fácil
dejar helpers y funciones que solo existían para ese código. `noUnusedLocals: true` y
`noUnusedParameters: true` del tsconfig los detectan, pero solo en CI con node_modules reales.

---

## Cuándo ejecutar este skill

- Después de eliminar un feature completo (drag-and-drop, tab, panel, wizard step)
- Después de reemplazar código IA/análisis por una versión nueva
- Antes de mergear a main cuando el diff tiene muchas líneas eliminadas
- Cuando el CI falla con `error TS6133: 'X' is declared but its value is never read`

---

## Paso 1: Identificar funciones y variables declaradas en el archivo

```bash
# Listar funciones const declaradas dentro del componente
grep -n "^  const \|^  function " <archivo>.tsx | grep -v "useMemo\|useState\|useCallback\|useEffect\|useRef"

# Listar funciones de nivel módulo (fuera del componente)
grep -n "^function \|^const " <archivo>.tsx | head -40
```

---

## Paso 2: Verificar si cada función/variable se usa

```bash
# Para cada nombre sospechoso:
grep -n "nombreFuncion" <archivo>.tsx
# Si solo aparece en su propia declaración → es huérfana → eliminar
```

**Patrón de huérfana:**
```
123: const estimatePinnedCardHeight = (pin: ...) => {   ← definición
# No aparece en ningún otro resultado → ELIMINAR
```

---

## Paso 3: Verificar imports no usados

```bash
# Lucide icons: listar todos y verificar que aparecen en JSX
grep -n "import {" <archivo>.tsx

# Para cada ícono importado:
grep -n "NombreIcono" <archivo>.tsx | grep -v "^[0-9]*:import"
# Si solo aparece en el import → ELIMINAR del import
```

---

## Paso 4: Ejecutar type check local

```bash
# En el entorno web (node_modules incompleto), este comando puede ser engañoso:
cd apps/pwa && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v "baseUrl"

# Si muestra solo errores de "Cannot find module" → es artefacto del entorno sin deps
# Los errores reales de unused vars SÍ se muestran aunque falten deps
```

---

## Gotchas críticos de TypeScript en este proyecto

### TypeScript version mismatch (IMPORTANTE)
```
Entorno local:  TypeScript 6.0.2 (instalado globalmente via npx)
Proyecto CI:    TypeScript 5.7.x (definido en package.json: "^5.7.2")
```

- **TS 6**: trata `baseUrl` como error TS5101 con exit code 2
- **TS 5.7**: `baseUrl` es solo warning, no error — CI pasa
- **NO agregar** `ignoreDeprecations: "6.0"` al tsconfig — TS 5.7 no reconoce ese valor → rompe CI

Si se ve el error TS5101 localmente pero el CI pasaba antes → es el mismatch de versión. Ignorar.

### Funciones solo usadas en código eliminado
Casos reales encontrados en este proyecto:
- `estimatePinnedCardHeight` — calculaba altura para bounds del drag. Al quitar drag, quedó sin uso.
- `hasExplicitSourceInWhy` — validación de texto IA. Estaba declarada pero nunca llamada.
- `buildShiftWindow` — usada en `trendForecastView`, NO huérfana (verificar antes de eliminar).

### Variables "usadas" dentro de `<div className="hidden">`
TypeScript considera como "usada" cualquier variable en JSX aunque esté en un div oculto.
Si envuelves código eliminado en `hidden` en lugar de borrarlo, TypeScript no se queja.
Pero la deuda técnica se acumula — preferir eliminar el código muerto limpiamente.

---

## Workflow completo antes de pushear

```bash
# 1. Buscar huérfanas
grep -n "^function \|^  const \|^  function " apps/pwa/src/pages/ModificadoHoy.tsx \
  | grep -v "useMemo\|useState\|useCallback\|useEffect\|useRef\|return\|if\|const ["

# 2. Para cada sospechosa, verificar uso
grep -n "nombreSospechoso" apps/pwa/src/pages/ModificadoHoy.tsx

# 3. Type check rápido (filtrando artefactos del entorno)
cd apps/pwa && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS6133\|error TS6196\|error TS6205"
# TS6133 = declared but never read
# TS6196 = declared but never used
# TS6205 = all imports in declaration are unused

# 4. Eliminar huérfanas

# 5. Confirmar
cd apps/pwa && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS6" && echo "Aún hay huérfanas" || echo "✓ Limpio"
```

---

## Errores frecuentes y su fix

| Error CI | Causa | Fix |
|----------|-------|-----|
| `TS6133: 'X' is declared but its value is never read` | Variable/función sin uso | Eliminar o prefijar `_` si es param de callback |
| `TS6196: 'X' is declared but never used` | Import de tipo sin uso | Eliminar del import |
| `TS5101: Option 'baseUrl' is deprecated` | TS 6 local vs TS 5.7 CI | Ignorar localmente, no agregar `ignoreDeprecations` |
| `TS2307: Cannot find module 'react'` | node_modules incompleto en entorno web | Artefacto local, no es error real de CI |
