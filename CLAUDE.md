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
| **Admin** | Configuracion, Jerarquias, Mapas, ETT, Clima Puerto, HMI Knuro, Baader 200, Editor Sidebar |

### Rutas publicas (sin auth)

| Ruta | Pagina |
|------|--------|
| `/aprendizaje` | LearningHubPage (hub de sub-modulos) |
| `/aprendizaje/baader-200` | Manual de ajustes Baader 200 |
| `/aprendizaje/hmi-knuro` | Simulador HMI Knuro |
| `/aprendizaje/seguridad` | Protocolos EPP, LOTO, emergencias, riesgos |
| `/aprendizaje/marel` | Guias equipos Marel (MX, Stork Trim, Scanvaegt) |
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
| `/admin/sidebar` | Editor drag & drop del sidebar (solo admin) |

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
sidebarConfig  ← nuevo: orden personalizado del sidebar admin
```

## Skills disponibles (.claude/skills/)

### Flujo de sesion
| Skill | Uso |
|-------|-----|
| `matar-pendientes` | **USAR AL INICIO.** Leer CLAUDE.md, clasificar pendientes, proponer plan de ataque |
| `cerrar-sesion` | **USAR AL FINAL.** Actualiza CLAUDE.md, sugiere skills, crea memoria |

### Deploy y CI
| Skill | Uso |
|-------|-----|
| `deploy-produccion` | Deploy completo a GitHub Pages con bump de version |
| `fix-ci` | Diagnosticar y reparar fallos de CI (tsc, eslint, build, GitHub Actions) |

### Auditorias
| Skill | Uso |
|-------|-----|
| `auditar-seguridad` | Auditoria 18 puntos (CORS, XSS, CSP, keys, Firestore rules, deps, etc.) |
| `auditar-ux-modulo` | Revisar UX de un modulo y proponer mejoras concretas |
| `revisar-responsive` | Verificar mobile/tablet/desktop con screenshots automaticos |

### Contenido y componentes
| Skill | Uso |
|-------|-----|
| `agregar-modulo-aprendizaje` | Agregar sub-modulo al Centro de Aprendizaje (`/aprendizaje/<slug>`) |
| `floating-image-editor` | Componente de imagenes con crop, zoom, libre posicionamiento, anotaciones SVG |

### Referencia
| Skill | Uso |
|-------|-----|
| `baul` | Ver catalogo completo de skills disponibles (proyecto + personales) |

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

- **v2.72.1** (2026-04-09)
- Proyecto Firebase: `mantenimiento-planta-771a3`
- GitHub: `orelcain/mantenimiento-planta`
- Produccion: `https://orelcain.github.io/mantenimiento-planta/`

## Cambios recientes (sesion 2026-04-09)

### Deploy v2.72.1 — Pendientes masivos resueltos
- **Calendario**: `<thead>` sticky top-0 (header visible al scrollear con 12-13 tecnicos), separador `border-b-2` entre grupos A/B/C
- **Modulos aprendizaje**: `/aprendizaje/seguridad` (EPP, LOTO, emergencias, riesgos) y `/aprendizaje/marel` (MX, Stork Trim, Scanvaegt) — activados en LearningHubPage
- **Editor Sidebar** (`/admin/sidebar`): drag & drop de grupos e items con @dnd-kit, persiste en Firestore `sidebarConfig/default`, MainLayout carga el orden dinamicamente al iniciar
- **Alto contraste**: hook `useHighContrast`, CSS `.high-contrast`, toggle boton Sol en header desktop Y en drawer mobile (junto al badge de version), persiste en localStorage
- **Preload lightbox**: `new Image()` en vecinos tanto en `ImageLightbox.tsx` como en `RepuestoDetailModal.tsx`
- **overscroll-contain**: regla global CSS para todos los `.overflow-x-auto` / `.overflow-x-scroll`
- **Proxy Vite eliminado**: server.proxy removido de `vite.config.ts`
- **Firestore input validation**: funciones de validacion para ganttTasks, ganttProjects, ganttComments, inventoryMovements, inspections, ariaFeedback, sidebarConfig
- **Fix CI**: errores TypeScript en ImageLightbox (type guard) y SidebarEditorPage (reduce + unused vars)

### Sesion 2026-04-08
- Calendario UX landscape/mobile completo, seguridad nivel 2, Baader 200 movil

## Pendientes priorizados

### P1 — Requiere Firebase CLI (hacer en maquina local)
- [ ] **Deploy Cloud Functions**: CORS restringido pendiente de deploy (`firebase deploy --only functions`)
- [ ] **App Check**: ReCaptchaV3 + enforceAppCheck en Cloud Functions

### P1.5 — Seguridad pendiente
- [ ] **SW SRI**: Self-host Firebase SDK en public/vendor/ (evitar 3rd-party scripts)
- [ ] **Input sanitization Firestore**: quedan ~18 colecciones sin validacion de tipos (spareParts, bodega, machineCategories, machines, ariaLearning, etc.)

### P2 — Mejoras UX futuras
- [ ] **Contenido real Seguridad**: agregar fichas PDF descargables, videos de EPP al modulo `/aprendizaje/seguridad`
- [ ] **Contenido real Marel**: agregar guias por equipo (MX, Stork Trim, Scanvaegt) con fotos
- [ ] **Modo alto contraste en calendario**: la tabla del calendario no reacciona al `.high-contrast` (colores hardcoded en bg-zinc-800, bg-cyan-500/5, etc.)
- [ ] **Editor sidebar — reordenar grupos en mobile**: el TouchSensor funciona pero puede ser mejorado

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
