---
name: auditar-seguridad
description: Auditoria de seguridad completa de la app. Revisa CORS, redirects, storage, console.log, webhooks, permisos Firestore, dependencias npm y rate limiting. Basada en checklist de @gbauzap + vulnerabilidades npm.
---

# Auditoria de Seguridad — Checklist completo

Ejecutar los 8 puntos de seguridad + audit de dependencias en paralelo.
Reportar hallazgos con severidad y aplicar fixes automaticamente donde sea seguro.

## Checklist de auditoria (8 puntos)

### 1. CORS — No dejar abierto
**Buscar en:** `functions/index.js`, `firebase.json`, `vite.config.ts`
**Patron peligroso:** `cors: true` o `Access-Control-Allow-Origin: *`
**Fix:** Usar array de origenes permitidos via constante `ALLOWED_ORIGINS`

```
Lanzar agente Explore:
"Buscar en functions/ cualquier onRequest con cors: true. 
Buscar en todo el proyecto Access-Control-Allow-Origin.
Reportar cada instancia con archivo y linea."
```

### 2. Redirects — Validar destinos
**Buscar en:** `apps/pwa/src/` — query params `?redirect=`, `?returnUrl=`, `?next=`
**Patron peligroso:** `searchParams.get('redirect')` usado directo en `navigate()` o `<Navigate>`
**Fix:** Validar que empiece con `/` y no con `//` (evita URLs externas)

```
Grep: searchParams.get.*redirect|returnUrl|next|callback
Grep: window.location.href\s*=|window.location.replace
Grep: navigate\(.*searchParams
```

### 3. Storage — Proteger buckets
**Buscar en:** `storage.rules`, `firebase.json`
**Patron peligroso:** `allow read: if true` o `allow write: if true` sin restricciones
**Aceptable:** Lectura publica en paths especificos (QR/aprendizaje) si escritura requiere auth

```
Leer: storage.rules completo
Buscar: "allow read: if true" y "allow write: if true"
Verificar que uploads en services/storage.ts no bypassen auth
```

### 4. console.log — Eliminar en produccion
**Buscar en:** `apps/pwa/src/**/*.{ts,tsx}`
**Verificar:** Que `vite.config.ts` tenga `esbuild.pure: ['console.log', 'console.debug']`
**Contar:** Total de console.log/error/warn en el proyecto

```
Grep: console\.(log|error|warn|debug|info) en apps/pwa/src/ — contar
Verificar vite.config.ts tiene esbuild.drop o esbuild.pure configurado
```

### 5. Webhooks — Verificar firmas
**Buscar en:** `functions/index.js`, `functions/**/*.js`
**Patron peligroso:** Endpoints `onRequest` sin validacion de auth/firma
**Aceptable:** `onCall` (Firebase valida auth automaticamente), `onSchedule`, triggers

```
Lanzar agente Explore:
"Listar todas las Cloud Functions, su tipo (onRequest/onCall/onSchedule/trigger),
y si validan autenticacion. Reportar las que NO validan."
```

### 6. Permisos en backend — No solo en UI
**Buscar en:** `firestore.rules`
**Patron peligroso:** `allow create, update, delete: if isAuthenticated()` sin validar rol
**Fix:** Usar `isTechnician()`, `isSupervisor()`, `isAdmin()` segun la operacion

```
Leer: firestore.rules completo
Buscar: colecciones con "if isAuthenticated()" en write/delete sin rol
Comparar con: las que SI tienen isTechnician/isSupervisor/isAdmin
Listar las permisivas con recomendacion de rol
```

### 7. Dependencias — npm audit
**Ejecutar:**
```
pnpm audit                    # Ver estado actual
pnpm audit --fix              # Intentar agregar overrides
pnpm install                  # Aplicar
pnpm audit                    # Verificar resultado
pnpm run build                # Verificar que compila
```

**Notas:**
- Overrides van en `pnpm-workspace.yaml` (pnpm 10+)
- `xlsx` no tiene fix (SheetJS es de pago, patched: `<0.0.0>`)
- Vulns en devDeps (eslint, tailwindcss) no afectan produccion
- CI usa pnpm 10+ (verificar `.github/workflows/deploy.yml`)

### 8. Rate limit en auth — Proteger login
**Buscar en:** `apps/pwa/src/pages/LoginPage.tsx`, `apps/pwa/src/services/auth.ts`
**Verificar:** Que el formulario de login use `RateLimiter` de `lib/rate-limit.ts`
**Verificar:** Que se muestre mensaje al usuario cuando excede intentos

```
Grep: RateLimiter|canExecute|rate.limit en LoginPage
Grep: signInWithEmailAndPassword|createUserWithEmailAndPassword en services/auth.ts
Verificar: que exista proteccion antes del try/catch de login
```

## Formato del reporte

Al finalizar, generar tabla resumen:

```
| # | Punto               | Estado    | Detalle                        |
|---|---------------------|-----------|--------------------------------|
| 1 | CORS                | OK / VULN | ...                            |
| 2 | Redirects           | OK / VULN | ...                            |
| 3 | Storage             | OK / VULN | ...                            |
| 4 | console.log         | OK / VULN | ...                            |
| 5 | Webhooks            | OK / N/A  | ...                            |
| 6 | Permisos backend    | OK / VULN | ...                            |
| 7 | Dependencias npm    | OK / VULN | X criticas, Y high, Z total    |
| 8 | Rate limit auth     | OK / VULN | ...                            |
```

## Ejecucion optima

Lanzar los 8 puntos en **paralelo** usando agentes Explore (puntos 1,2,3,5,6) y Grep/Read directos (puntos 4,7,8).

Aplicar fixes automaticamente solo para:
- vite.config.ts (console.log drop) — seguro, no rompe nada
- Redirect validation — seguro, solo agrega validacion

Para los demas, reportar y pedir confirmacion antes de aplicar.
