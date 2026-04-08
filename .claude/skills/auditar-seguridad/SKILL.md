---
name: auditar-seguridad
description: Auditoria de seguridad completa (18 puntos). Nivel 1 (8 pts): CORS, redirects, storage, console.log, webhooks, permisos Firestore, dependencias npm, rate limiting. Nivel 2 (10 pts): API keys, XSS, CSP headers, localStorage, uploads, App Check, secrets, SW, input sanitization, HTTPS.
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

## Checklist nivel 2 (10 puntos avanzados)

### 9. API Keys expuestas en el bundle
**Buscar en:** `apps/pwa/src/services/ai*.ts`, `apps/pwa/src/services/chatbot.ts`
**Patron peligroso:** `import.meta.env.VITE_*_API_KEY` usado en fetch directo al proveedor
**Fix:** Eliminar fallback directo a APIs externas, usar solo Cloud Functions proxy

```
Grep: VITE_.*API_KEY en apps/pwa/src/ — verificar que no se usen en Authorization headers
Grep: Bearer.*API_KEY|key=.*API_KEY — llamadas directas con keys
```

### 10. XSS — dangerouslySetInnerHTML e innerHTML
**Buscar en:** `apps/pwa/src/**/*.{ts,tsx}`
**Patron peligroso:** `dangerouslySetInnerHTML` sin DOMPurify, `innerHTML = ` con datos de usuario
**Aceptable:** `dangerouslySetInnerHTML` con DOMPurify.sanitize()

```
Grep: dangerouslySetInnerHTML en apps/pwa/src/
Grep: \.innerHTML\s*= en apps/pwa/src/
Grep: eval\(|new Function\( en apps/pwa/src/
Verificar: cada uso si el dato viene de usuario/Firestore sin sanitizar
```

### 11. CSP Headers — Content Security Policy
**Buscar en:** `firebase.json`, `apps/pwa/index.html`
**Verificar headers:** CSP, X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy
**Fix:** Agregar headers en firebase.json seccion hosting.headers

```
Grep: Content-Security-Policy|X-Frame-Options|X-Content-Type en firebase.json
Grep: http-equiv.*Content-Security en apps/pwa/index.html
```

### 12. Datos sensibles en localStorage
**Buscar en:** `apps/pwa/src/**/*.{ts,tsx}`
**Patron peligroso:** Tokens, passwords, user data completo en localStorage
**Aceptable:** Preferencias UI, estado de sidebar, tema

```
Grep: localStorage\.setItem|sessionStorage\.setItem en apps/pwa/src/
Grep: persist.*middleware en apps/pwa/src/store/
Verificar: que datos guardan los stores con persist()
```

### 13. Validacion de uploads (tipo + tamaño)
**Buscar en:** `storage.rules`, `apps/pwa/src/services/storage.ts`
**Patron peligroso:** Paths sin `request.resource.contentType.matches()` o sin size limit
**Fix:** Agregar validacion de tipo en storage.rules para paths sin restriccion

```
Leer: storage.rules — buscar paths sin contentType.matches()
Grep: uploadBytes|uploadString en apps/pwa/src/ — verificar que llamen validateFile()
```

### 14. Firebase App Check
**Buscar en:** `apps/pwa/src/services/firebase.ts`, `functions/index.js`
**Patron peligroso:** `enforceAppCheck: false` o ausencia total de App Check
**Fix:** Inicializar App Check con ReCaptchaV3Provider + enforceAppCheck en funciones

```
Grep: appCheck|initializeAppCheck|ReCaptcha en apps/pwa/src/
Grep: enforceAppCheck en functions/
```

### 15. Secrets en codigo
**Buscar en:** Todo el proyecto (excluir node_modules)
**Patron peligroso:** Passwords hardcodeados, API keys en strings, .env commiteados
**Fix:** Mover a env vars o Cloud Functions secrets

```
Grep: password.*=.*'|secret.*=.*'|apiKey.*=.*' en apps/pwa/src/ y functions/
Grep: sk-|AIza|ghp_|ghu_ — patrones comunes de keys
Verificar: .gitignore excluye .env, .env.local, serviceAccountKey.json
```

### 16. Service Worker — Cache e integridad
**Buscar en:** `apps/pwa/public/sw.js` o `firebase-messaging-sw.js`
**Patron peligroso:** importScripts sin SRI, cache sin validacion de respuesta
**Aceptable:** Stale-while-revalidate con check de res.ok

```
Leer: apps/pwa/public/firebase-messaging-sw.js
Grep: importScripts en apps/pwa/public/ — verificar si tienen integrity
Grep: cache\.put|caches\.open — estrategia de cache
```

### 17. Input sanitization en Firestore
**Buscar en:** `firestore.rules`, `apps/pwa/src/services/*.ts`
**Patron peligroso:** Write rules sin validacion de tipos (is string, .size(), etc.)
**Fix:** Agregar validacion de tipos en rules + usar Zod en service layer

```
Contar: rules con validacion de tipos vs rules sin validacion en firestore.rules
Grep: setDoc|updateDoc|addDoc en apps/pwa/src/services/ — verificar si validan
Grep: safeParse|validateOrThrow en apps/pwa/src/ — donde se usa Zod
```

### 18. HTTPS y URLs seguras
**Buscar en:** `apps/pwa/src/**/*.{ts,tsx}`
**Patron peligroso:** URLs `http://` (excepto localhost y SVG namespaces)
**Fix:** Cambiar a https:// donde aplique

```
Grep: http:// en apps/pwa/src/ — filtrar localhost y xmlns
```

## Formato del reporte nivel 2

```
| #  | Punto               | Estado    | Detalle                        |
|----|---------------------|-----------|--------------------------------|
| 9  | API Keys bundle     | OK / VULN | ...                            |
| 10 | XSS                 | OK / VULN | ...                            |
| 11 | CSP Headers         | OK / VULN | ...                            |
| 12 | localStorage        | OK / VULN | ...                            |
| 13 | Upload validation   | OK / VULN | ...                            |
| 14 | App Check           | OK / VULN | ...                            |
| 15 | Secrets en codigo   | OK / VULN | ...                            |
| 16 | Service Worker      | OK / VULN | ...                            |
| 17 | Input sanitization  | OK / VULN | ...                            |
| 18 | HTTPS               | OK / VULN | ...                            |
```

## Ejecucion optima

**Nivel 1 (rapido):** Lanzar los 8 puntos en paralelo con Grep/Read directos.
**Nivel 2 (profundo):** Lanzar los 10 puntos adicionales con agentes Explore en paralelo.

Aplicar fixes automaticamente solo para:
- vite.config.ts (console.log drop) — seguro, no rompe nada
- Redirect validation — seguro, solo agrega validacion

Para los demas, reportar hallazgos y pedir confirmacion antes de aplicar.

Al finalizar, generar tablas resumen de nivel 1 y nivel 2 con estado de cada punto.
