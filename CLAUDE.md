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
| `deploy-produccion` | Deploy a GitHub Pages con bump de version |
| `agregar-modulo-aprendizaje` | Agregar sub-modulo al Centro de Aprendizaje |
| `floating-image-editor` | Componente de imagenes con crop, zoom, anotaciones SVG |
| `auditar-seguridad` | **Auditoria de seguridad 18 puntos** (CORS, XSS, CSP, keys, storage, Firestore rules, deps, etc.) |
| `auditar-ux-modulo` | Revisar UX de un modulo y proponer mejoras |
| `revisar-responsive` | Verificar responsive de una pagina en mobile/tablet/desktop |

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

### Calendario Mantencion — UX mobile/landscape/desktop
- **Landscape mobile**: control bar compacta, table-fixed 25/50/25%, swipe semanas, boton "Ir a hoy"
- **Admin PIN gate**: requiere clave (`getHmiTooltipPwd()`) para activar modo edicion mobile
- **Horas sem/mes**: lado a lado con header horizontal `h·sem | h·mes`
- **4 colores horas**: verde=cumple, naranja=sobretiempo, amarillo=bajo, rojo=muy bajo
- **Ley 40h Chile**: ya implementada (42h desde 26/04/2026, cambio automatico)
- **shortName mejorado**: detecta formato "APELLIDO1 APELLIDO2, NOMBRE1 NOMBRE2" → "NOMBRE APELLIDO1 A."
- **Placeholders tecnicos**: boton "Placeholders turno" agrega automaticamente los que faltan para 4/turno
- **Header dark**: `bg-zinc-800` reemplaza `bg-primary` (celeste) en mobile + desktop
- **Desktop turno rows**: filas coloreadas A=cyan B=amber C=violet, border-b separacion
- **Vista D/T/N**: solo letra sin hora en landscape
- **Vista HH:MM**: celdas con color de fondo por tipo turno
- **ChatBot Aria**: oculto en landscape mobile (`.landscape-mobile-hidden`)
- **Top header**: oculto en mobile (`hidden lg:flex`)

### Sesion 2026-04-07
- Vulnerabilidades npm: 69→10, overrides en pnpm-workspace.yaml
- Auditoria seguridad: 15/18 puntos (CORS, XSS, CSP, Firestore rules, rate limit, etc.)
- Baader 200 movil/desktop, Centro de Aprendizaje, Sidebar agrupado

## Pendientes priorizados

### P0 — Proxima sesion
- [ ] **Deploy a produccion**: cambios calendario UX pendientes de deploy (`pnpm deploy --patch`)
- [ ] **Probar calendario con 12-13 tecnicos**: agregar placeholders y verificar scroll/layout
- [ ] **Editor de sidebar admin**: drag & drop modulos entre categorias, persistir en Firestore

### P1 — Corto plazo
- [ ] **Deploy Cloud Functions**: CORS restringido pendiente de deploy
- [ ] **Modulo Seguridad en Planta**: activar placeholder en /aprendizaje, crear pagina con protocolos EPP
- [ ] **Modulo Marel**: activar placeholder, crear guias de equipos Marel

### P1.5 — Seguridad pendiente
- [ ] **App Check**: ReCaptchaV3 + enforceAppCheck en Cloud Functions
- [ ] **SW SRI**: Self-host Firebase SDK en public/vendor/
- [ ] **Input sanitization Firestore**: validacion de tipos en 25 rules

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
