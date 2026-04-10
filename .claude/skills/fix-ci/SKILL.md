---
name: fix-ci
description: Diagnosticar y resolver fallos del CI (GitHub Actions) antes de pushear a main. Cubre type check, lint, build errors. Usar cuando el deploy falla en Actions o antes de pushear cambios criticos.
argument-hint: "<tipo-error: ts|lint|build|all>"
---

# Fix CI — Diagnostico y Reparacion

Guia para diagnosticar y resolver fallos del pipeline de CI/CD antes de que bloqueen el deploy.

---

## Pipeline de CI (`.github/workflows/deploy.yml`)

El CI corre estos pasos en orden:

```
1. Setup Node.js + pnpm
2. Install dependencies (pnpm install)
3. Validate SPA route collisions (script interno)
4. Type check  ← MAS COMUN QUE FALLE
5. Lint        ← SEGUNDO MAS COMUN
6. Build PWA   ← FALLA SI ALGO NO COMPILA
7. Deploy      ← Solo si todo lo anterior pasa
```

---

## Comandos de diagnostico

Siempre correr **en este orden** antes de pushear a main:

```bash
# 1. TypeScript (el mas importante — bloquea el CI)
cd apps/pwa && npx tsc --noEmit

# 2. ESLint (max 10 warnings antes de fallar)
cd apps/pwa && pnpm exec eslint . --max-warnings 10

# 3. Build completo (verifica que Vite puede empaquetar)
cd apps/pwa && pnpm run build
```

---

## Errores TypeScript comunes

### Error: Variable declarada pero no usada
```
error TS6133: 'nombreVariable' is declared but its value is never read.
```
**Fix:** Eliminar la variable o prefijarla con `_` si es un param de callback que no se usa.
Tras refactors grandes, buscar funciones helper que solo se usaban en el código eliminado:
```bash
grep -n "nombreFuncion" archivo.tsx
# Si solo aparece en su declaración → huérfana → eliminar
```
Ver skill `/audit-unused-locals` para el flujo completo.

### GOTCHA: TypeScript version mismatch local vs CI
```
Entorno local:  TypeScript 6.0.2 (npx usa la versión global)
CI:             TypeScript 5.7.x (la del package.json: "^5.7.2")
```
- TS 6 trata `baseUrl` como error TS5101 con exit code 2.
- TS 5.7 lo trata como warning — el CI pasaba igual con `baseUrl`.
- **NO agregar** `ignoreDeprecations: "6.0"` al tsconfig para "arreglarlo" — TS 5.7 no
  reconoce ese valor → rompe el CI inmediatamente (falla en segundos).
- Si ves TS5101 localmente pero el CI pasaba antes → es el mismatch. Ignorar.

### Error: Tipo posiblemente undefined
```
error TS18048: 'obj' is possibly 'undefined'.
```
**Fix:** Agregar guard: `if (!obj) return` o usar optional chaining `obj?.prop`.

### Error: filter(Boolean) no reduce tipo
```
error TS2322: Type '(string | undefined)[]' is not assignable to type 'string[]'
```
**Fix:** Usar type guard explicito:
```typescript
// MAL
.filter(Boolean)
// BIEN
.filter((x): x is string => typeof x === 'string')
// O para objetos
.filter((x): x is MyType => x !== undefined)
```

### Error: Propiedad no existe en tipo indexado
```
error TS2322: Type 'X | undefined' is not assignable to type 'X'
```
**Fix al acceder un Record/objeto con key variable:**
```typescript
// MAL
const item = map[key]  // puede ser undefined si key no esta
// BIEN con reduce
const result = keys.reduce<T[]>((acc, key) => {
  const item = map[key]
  if (!item) return acc
  acc.push(item)
  return acc
}, [])
```

### Error: Import no encontrado
```
error TS2307: Cannot find module '@/...' or its corresponding type declarations.
```
**Fix:** Verificar que el archivo existe en la ruta correcta y que el alias `@` apunta a `src/`.

---

## Errores ESLint comunes

### Demasiados warnings (> 10)
```bash
# Ver cuantos warnings hay y cuales son
cd apps/pwa && pnpm exec eslint . 2>&1 | tail -5
```
Generalmente son `console.log` sin quitar, `any` implicito, o hooks con dependencias incorrectas.

### React hooks exhaustive-deps
```
React Hook useEffect has a missing dependency: 'xxx'
```
**Fix:** Agregar la dependencia al array, o si es una funcion estable, envolverla en `useCallback`.

---

## Errores de Build (Vite/Rolldown)

### Chunk demasiado grande (warning, no error)
```
Some chunks are larger than 500 kB after minification
```
No bloquea el build. Ignorar por ahora.

### Eval directo (warning)
```
Use of direct eval function is strongly discouraged
```
Viene de `pdfjs-dist`. Ignorar — es una dependencia externa.

### manualChunks debe ser funcion
```
manualChunks is not a function
```
**Fix en `vite.config.ts`:**
```typescript
// MAL (objeto)
manualChunks: { vendor: ['react', 'react-dom'] }
// BIEN (funcion — requerido por Vite 8+/rolldown)
manualChunks(id) {
  if (id.includes('node_modules/react')) return 'vendor'
}
```

---

## Workflow de fix rapido

```bash
# 1. Identificar el error
cd apps/pwa && npx tsc --noEmit 2>&1 | grep "error TS"

# 2. Corregir el archivo indicado

# 3. Verificar que se resolvio
cd apps/pwa && npx tsc --noEmit && echo "✓ TS OK"

# 4. Verificar lint
cd apps/pwa && pnpm exec eslint . --max-warnings 10 && echo "✓ Lint OK"

# 5. Build final
cd apps/pwa && pnpm run build 2>&1 | tail -3

# 6. Pushear solo si todo paso
git push origin main
```

---

## Firebase Functions CI (deploy-functions.yml)

Este workflow **falla frecuentemente** y es separado del deploy PWA.
**No bloquea el deploy de la PWA.**

Causas comunes de fallo:
- Credenciales de Firebase desactualizadas en GitHub Secrets
- Error de compilacion en `functions/src/`
- Timeout en el deploy

**Fix:** Hacer deploy manual desde maquina local:
```bash
cd functions
firebase deploy --only functions
```
