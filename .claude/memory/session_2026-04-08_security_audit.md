# Sesion 2026-04-08 — Auditoria de Seguridad Completa

## Resumen
Auditoria de seguridad de 18 puntos basada en checklist de @gbauzap (Instagram) + puntos avanzados propios. Se resolvieron 15/18 puntos.

## Commits (12 en total)
- fix: resolve npm vulnerabilities and fix Vite 8 build
- fix: update CI pnpm version to 10.33.0
- fix(security): harden app against OWASP top vulnerabilities
- fix: use string origins instead of regex for Firebase CORS compat
- fix(security): restrict 6 more Firestore collections to role-based access
- fix(security): level 2 hardening — OTA password, XSS, CSP, uploads
- feat: expand security audit skill to 18 points
- fix: remove ajv and pdfjs-dist overrides that broke ESLint and tsc
- fix(security): remove direct AI API key exposure from frontend bundle

## Decisiones importantes

### Overrides que NO se deben agregar
- `ajv` — rompe ESLint (@eslint/eslintrc usa ajv internamente)
- `pdfjs-dist` — rompe API de render (RenderParameters requiere canvas en v4.2+)
- Ambos son vulns en devDeps, no afectan produccion

### AI Keys — Arquitectura
- Se eliminaron TODOS los fallbacks directos a APIs de AI
- Groq, Gemini, DeepSeek ahora solo van por Cloud Functions (groqProxy, geminiProxy, deepseekProxy)
- Si Cloud Function no está disponible, se muestra error en vez de exponer key
- Las constantes GROQ_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY están en '' (bloqueadas)

### Firestore rules — Colecciones que SON aceptables con isAuthenticated()
Estas colecciones usan `isAuthenticated()` para create intencionalmente:
- audit_log, trash — cualquier usuario genera logs/elimina
- ariaMissionLogs, ariaLearning, ariaActions, ariaFeedback, ariaCorrections — sistema ARIA
- ariaKnowledge, ariaEquipmentPatterns — aprendizaje colectivo
- inventoryMovements — tecnicos registran movimientos

### Deploy Cloud Functions
- El workflow `deploy-functions.yml` falla porque `FIREBASE_SERVICE_ACCOUNT` no está configurado
- Necesita: Firebase Console > Project Settings > Service Accounts > Generate New Private Key
- O ejecutar `firebase login && firebase deploy --only functions` desde PC local

## 3 puntos pendientes de seguridad
1. **App Check** — necesita ReCaptchaV3 key de Firebase Console
2. **SW SRI** — self-host Firebase SDK (necesita curl desde PC)
3. **Input sanitization** — 25 rules sin validacion de tipos (esfuerzo alto)
