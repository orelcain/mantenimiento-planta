---
name: pre-push-check
description: Verificar tsc + eslint ANTES de git push para evitar commits fallidos en CI. Usar SIEMPRE antes de pushear a main, especialmente en sesiones con muchos cambios. Previene el patron "feature commit → CI falla → fix commit → CI pasa" que genera ruido en el historial.
argument-hint: "<scope: ts|lint|build|all (default: ts+lint)>"
---

# Pre-Push Check — Verificación antes de pushear

Este skill existe porque en sesiones de desarrollo iterativo rápido es fácil dejar errores de TypeScript o ESLint que hacen fallar el CI, generando historial ruidoso (commits con ❌ seguidos de `fix:` commits).

**Incidente del 2026-04-13**: ~8 commits fallaron CI durante la sesión de la noche por `noUnusedLocals` y errores TS. Cada falla generó un run rojo innecesario.

---

## Cuándo usar

- **SIEMPRE** antes de `git push origin main`
- Especialmente después de sesiones con muchos cambios o refactors grandes
- Cuando se eliminó código (variables/funciones potencialmente huérfanas)
- Antes de ejecutar `/cerrar-sesion`
- Como paso previo en `/deploy-produccion`

---

## Paso 1: TypeScript (obligatorio, más común que falle)

```bash
cd apps/pwa && pnpm exec tsc --noEmit 2>&1
```

**Verde esperado**: sin output = sin errores ✅

Errores comunes y fix rápido:

| Error | Causa | Fix |
|-------|-------|-----|
| `TS6133` | Variable/import no usado | Eliminar o prefijarlo con `_` |
| `TS2304` | Cannot find name | Import faltante |
| `TS18048` | Possibly undefined | Agregar guard `if (!x) return` |
| `TS2339` | Property does not exist | Tipo incorrecto o propiedad nueva |

Si hay muchos errores de variables huérfanas tras un refactor → usar `/audit-unused-locals`.

---

## Paso 2: ESLint (obligatorio, CI falla con >10 warnings O cualquier error)

```bash
cd apps/pwa && pnpm exec eslint . --max-warnings 10 2>&1 | tail -8
```

**Verde esperado**: `0 problems` o `N problems (0 errors, N warnings)` donde N ≤ 10

Causas comunes de fallo:

| Regla | Nivel | Fix |
|-------|-------|-----|
| `react-hooks/rules-of-hooks` | **ERROR** | Mover hooks ANTES de cualquier `return` condicional |
| `react-hooks/exhaustive-deps` | warning | Agregar dep al array o usar `useCallback` |
| `@typescript-eslint/no-unused-vars` | warning | Eliminar o prefijarlo con `_` |
| `no-console` | warning | Eliminar `console.log` de debug |

---

## Paso 3: Build (opcional — solo antes de releases importantes)

```bash
cd apps/pwa && pnpm run build 2>&1 | tail -5
```

**Verde esperado**: `✓ built in Xs`

---

## One-liner rápido (el más útil)

```bash
cd apps/pwa && pnpm exec tsc --noEmit && pnpm exec eslint . --max-warnings 10 && echo "✅ LISTO PARA PUSH"
```

Si imprime `✅ LISTO PARA PUSH` → pushear con confianza.
Si falla → el mensaje de error indica qué corregir. Usar `/fix-ci` para guía detallada.

---

## Tabla de estados

| Check | ✅ Verde | ⚠️ Amarillo | ❌ Rojo (bloquea CI) |
|-------|---------|------------|---------------------|
| TSC | 0 errores | — | ≥1 error |
| ESLint | 0 warnings | 1–10 warnings | ≥1 error **o** >10 warnings |
| Build | Éxito | Warnings chunk | Error |

---

## Integración con otros skills

- `/cerrar-sesion` → corre este check en el **Paso 4** antes del commit final
- `/deploy-produccion` → Step 1 obligatorio antes de build
- `/fix-ci` → cuando este check falla y necesitás guía de reparación
- `/audit-unused-locals` → cuando hay muchos TS6133 tras un refactor
