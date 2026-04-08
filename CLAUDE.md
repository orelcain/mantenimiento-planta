# Mantenimiento Industrial — PWA

> Sistema de mantenimiento industrial para plantas de procesamiento de pescado.
> PWA con soporte offline, monorepo Turbo, React + Vite + Firebase.

## Reglas de desarrollo

- **Idioma**: Siempre responder en **ESPAÑOL**. Ahorrar tokens.
- **Ruta de trabajo**: Editar SIEMPRE en `D:\a\APP leventamiento de insidencias en planta\` (NO en OneDrive). Vite corre desde `D:\a\`.
- **Commits**: En inglés, prefijos convencionales (`feat:`, `fix:`, `docs:`, etc.)
- **No crear README.md ni docs** salvo que se pida explicitamente.
- **Base URL**: `/mantenimiento-planta/` (GitHub Pages)
- **Deploy**: GitHub Pages via `gh-pages` branch + Firebase Hosting

## Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 18 + TypeScript 5.7 + Vite 6 |
| UI | Tailwind CSS + Radix UI + Lucide icons |
| Estado | Zustand (7 stores) |
| Backend | Firebase (Firestore, Auth, Storage, RTDB, Messaging) |
| Graficos | ECharts, Chart.js, Three.js (@react-three) |
| Mapas | Leaflet, MapLibre GL |
| Monorepo | Turbo, pnpm |
| PWA | Workbox, service worker manual |

## Estructura del proyecto

```
apps/pwa/src/
  pages/          → 34 paginas (ver seccion Modulos)
  services/       → 58+ servicios Firestore/RTDB
  components/     → 17 subcarpetas de componentes
  store/          → 7 stores Zustand
  hooks/          → Hooks personalizados
  types/          → Tipos TypeScript
  constants/      → Version, config
  App.tsx         → Router principal
```

## Modulos del sistema

### Sidebar agrupado (MainLayout.tsx)

| Grupo | Modulos |
|-------|---------|
| **Principal** | Dashboard, Incidencias, Evidencias |
| **Planificacion** | Inspecciones, Preventivo, Predictivo, Gantt, Calendario |
| **Equipamiento** | Equipos, Repuestos, Sensores, Panel Sensores |
| **Herramientas** | Visor de Mapas, Visor 3D, Analisis Grader |
| **Aprendizaje** | Centro de Aprendizaje (/aprendizaje) |
| **Admin** | Configuracion, Jerarquias, Mapas, ETT, Clima Puerto, HMI Knuro, Baader 200 |

### Rutas publicas (sin auth)

| Ruta | Pagina |
|------|--------|
| `/aprendizaje` | LearningHubPage (hub de sub-modulos) |
| `/aprendizaje/baader-200` | Manual de ajustes Baader 200 |
| `/aprendizaje/hmi-knuro` | Simulador HMI Knuro |
| `/v/:modelId` | Visor 3D publico |
| `/public/equipment` | Vista publica de equipos |

### Rutas admin

| Ruta | Pagina |
|------|--------|
| `/baader-200` | Editor Baader 200 (con crop, anotaciones, imagenes) |
| `/hmi-knuro` | Editor HMI Knuro (presets, parametros) |
| `/hierarchy` | Jerarquia de maquinas |
| `/admin/maps` | Editor de mapas |
| `/admin/ett` | Especificaciones tecnicas |

## Firestore — Colecciones principales

```
users, incidents, equipment, machines (subcol: repuestos)
preventiveTasks, inspections, photoEvidence
ganttProjects, ganttTasks, ganttComments
baader200Sections, baader200LearningHistory
hmiKnuroDefaults, hmiKnuroPresets
graderAnalysisSessions, graderGatesConfigs
models3d (subcol: annotations)
auditLog, trash
ariaMissionLogs, ariaKnowledgeBase, ariaPatterns
ett, inviteCodes, roles, mapLocations
```

## Skills disponibles (.claude/skills/)

| Skill | Uso |
|-------|-----|
| `cerrar-sesion` | **USAR AL FINAL DE CADA SESION.** Actualiza CLAUDE.md, sugiere skills, crea memoria |
| `agregar-modulo-aprendizaje` | Agregar sub-modulo al Centro de Aprendizaje |
| `floating-image-editor` | Componente de imagenes con crop, zoom, anotaciones SVG |
| `auditar-seguridad` | **Auditoria de seguridad 18 puntos** (CORS, XSS, CSP, keys, storage, Firestore rules, deps, etc.) |
| `deploy-produccion` | Procedimiento de deploy a produccion (GitHub Pages) |

## Mentalidad de mejora continua

**En cada sesion, Claude debe pensar activamente en:**
1. ¿Hay patrones que se repiten y podrian ser una skill?
2. ¿Hay procesos complejos que necesitan una guia paso a paso?
3. ¿Estamos haciendo algo manualmente que podria automatizarse?
4. ¿El CLAUDE.md tiene toda la info que la proxima sesion necesitaria?

**Al detectar una oportunidad de skill, sugerirla al usuario** con formato:
> "Detecte que hicimos X varias veces. Sugiero crear una skill `nombre-skill` que automatice esto."

**Al cerrar sesion**: ejecutar `/cerrar-sesion` para actualizar contexto y sugerir mejoras.

## Version actual

- **v2.72.0** (2026-04-07)
- Proyecto Firebase: `mantenimiento-planta-771a3`
- GitHub: `orelcain/mantenimiento-planta`
- Produccion: `https://orelcain.github.io/mantenimiento-planta/`

## Cambios recientes (sesion 2026-04-08)

### Vulnerabilidades npm
- 69→10 vulnerabilidades (2 criticas resueltas, 49 overrides en pnpm-workspace.yaml)
- Overrides de ajv y pdfjs-dist removidos (rompian ESLint y tsc)
- CI actualizado a pnpm 10.33.0, campo `packageManager` agregado
- `manualChunks` convertido de objeto a funcion (compatibilidad Vite 8/rolldown)

### Auditoria de seguridad — 15/18 puntos resueltos
- **CORS**: 3 Cloud Functions restringidas a `ALLOWED_ORIGINS` (pendiente deploy Firebase)
- **Redirects**: Validacion anti-phishing en App.tsx y LoginPage.tsx
- **console.log**: Eliminados del build con `esbuild.pure`
- **Firestore rules**: 14 colecciones endurecidas con roles (`isTechnician/isSupervisor/isAdmin`)
- **Rate limit**: 5 intentos / 2 min en login con `RateLimiter`
- **CSP headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **XSS**: innerHTML sanitizado con `esc()` en exportETTPDF.ts y telemetryAuditExport.ts
- **Upload validation**: contentType en storage.rules para graderUploads y models3d
- **Password OTA**: Removido `'12345678'` hardcodeado, movido a env var
- **API Keys**: Eliminado fallback directo a Groq/Gemini/DeepSeek, todo via Cloud Functions

### Skills creadas
- `/auditar-seguridad` — 18 puntos (nivel 1 + nivel 2), ejecuta en paralelo con agentes

## Pendientes priorizados

### P0 — Proxima sesion
- [ ] **Editor de sidebar admin**: drag & drop modulos entre categorias, persistir en Firestore. Ver `.claude/memory/session_sidebar_editor_pending.md`

### P1 — Corto plazo
- [ ] **Deploy Cloud Functions**: CORS restringido pendiente de deploy. Ejecutar `firebase deploy --only functions` o arreglar secret `FIREBASE_SERVICE_ACCOUNT` en GitHub
- [ ] **Modulo Seguridad en Planta**: activar placeholder en /aprendizaje, crear pagina con protocolos EPP, bloqueo/etiquetado
- [ ] **Modulo Marel**: activar placeholder, crear guias de equipos Marel
- [x] **Vulnerabilidades npm**: 69→10 (2 criticas resueltas, 51 overrides). Restantes son devDeps y xlsx sin fix
- [x] **Deploy a produccion**: mergeado a main, GitHub Actions despliega automaticamente
- [x] **Auditoria de seguridad**: 15/18 puntos resueltos (nivel 1 + nivel 2). Usar `/auditar-seguridad` para re-ejecutar

### P1.5 — Seguridad pendiente
- [ ] **App Check**: Implementar ReCaptchaV3 + enforceAppCheck en Cloud Functions (necesita key de Firebase Console)
- [ ] **SW SRI**: Self-host Firebase SDK en public/vendor/ en vez de CDN. Ejecutar desde PC: `curl -o apps/pwa/public/vendor/firebase-app-compat.js https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js`
- [ ] **Input sanitization Firestore**: Agregar validacion de tipos a 25 rules sin validacion en firestore.rules

### P2 — Mejoras UX
- [ ] **Modo alto contraste**: toggle en header para ambientes con luz intensa (planta)
- [ ] **Precargar imagenes lightbox**: `<link rel="preload">` en thumbnails movil
- [ ] **Proteccion scroll pantallas mojadas**: `overscroll-behavior: contain` en carruseles
- [ ] **Quitar proxy Vite**: las imagenes baader200-manual ya estan en public/ (el proxy es fallback innecesario)

## Flujo: Fix vulnerabilidades + Deploy a produccion

Procedimiento optimizado para resolver vulnerabilidades npm y deployar:

```
1. pnpm audit                          # Ver estado actual
2. pnpm audit --fix                    # Agrega overrides en pnpm-workspace.yaml
3. pnpm install                        # Aplicar los overrides
4. pnpm audit                          # Verificar cuantas se resolvieron
5. pnpm run build                      # Verificar que compila (si falla, revisar vite.config.ts)
6. git add + commit + push a branch
7. git checkout main && git reset --hard origin/main   # Sincronizar main local
8. git merge <feature-branch> --no-edit                # Fast-forward merge
9. git push origin main                                # Dispara GitHub Actions deploy
10. git checkout <feature-branch>                      # Volver a branch de trabajo
```

**Notas importantes:**
- Los overrides van en `pnpm-workspace.yaml` (formato pnpm 10+)
- CI en `.github/workflows/deploy.yml` debe usar pnpm 10+ (compatible con overrides)
- `manualChunks` en `vite.config.ts` debe ser **funcion** (no objeto) para Vite 8+/rolldown
- `xlsx` no tiene fix disponible (SheetJS paso a modelo de pago, patched: `<0.0.0>`)
- Vulnerabilidades en devDeps (eslint, tailwindcss) no afectan produccion
- Deploy se dispara automaticamente con push a main via GitHub Actions

## Notas para sesiones nuevas

Al iniciar una nueva sesion de Claude Code en este proyecto:
1. Este archivo se lee automaticamente — contiene todo el contexto
2. Skills en `.claude/skills/` estan disponibles como slash commands
3. Memoria de sesiones pasadas en `.claude/memory/`
4. Siempre editar en `D:\a\APP leventamiento de insidencias en planta\`
5. Vite dev server: `cd apps/pwa && npm run dev -- --port 5174 --host`
6. Preview: usar `.claude/launch.json` con `preview_start`
7. **Al terminar la sesion**: ejecutar skill `cerrar-sesion` para actualizar este archivo
8. **Durante la sesion**: pensar en oportunidades de crear skills nuevas
