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

## Cambios recientes (sesion 2026-04-07)

- Baader 200 movil: thumbnails con crop + lightbox zoom, font 15px, tap-to-mark pasos
- Baader 200 desktop: columna derecha responsive con divisor draggable (25%-75%)
- Breakpoint tablet 900px: layout 1 columna con imagenes grandes
- Posiciones de imagenes admin persisten entre lock/unlock
- Proxy Vite para imagenes baader200-manual desde GitHub Pages
- Fix navegacion pestañas en /learn (ruta absoluta)
- Targets tactiles 48px para uso con guantes industriales
- **Centro de Aprendizaje** (`/aprendizaje`): hub con cards para Baader 200 y HMI Knuro
- **Sidebar agrupado**: 6 categorias colapsables con persistencia en localStorage
- Boton "Ir a la App" en hub de aprendizaje
- CLAUDE.md creado como memoria persistente del proyecto
- Skills: `cerrar-sesion`, `agregar-modulo-aprendizaje` (renombrada a español)

## Pendientes priorizados

### P0 — Proxima sesion
- [ ] **Editor de sidebar admin**: drag & drop modulos entre categorias, persistir en Firestore. Ver `.claude/memory/session_sidebar_editor_pending.md`

### P1 — Corto plazo
- [ ] **Modulo Seguridad en Planta**: activar placeholder en /aprendizaje, crear pagina con protocolos EPP, bloqueo/etiquetado
- [ ] **Modulo Marel**: activar placeholder, crear guias de equipos Marel
- [ ] **Vulnerabilidades npm**: 92 reportadas por Dependabot (3 criticas). Ejecutar `npm audit fix`
- [ ] **Deploy a produccion**: los cambios de esta sesion estan en main pero no en gh-pages

### P2 — Mejoras UX
- [ ] **Modo alto contraste**: toggle en header para ambientes con luz intensa (planta)
- [ ] **Precargar imagenes lightbox**: `<link rel="preload">` en thumbnails movil
- [ ] **Proteccion scroll pantallas mojadas**: `overscroll-behavior: contain` en carruseles
- [ ] **Quitar proxy Vite**: las imagenes baader200-manual ya estan en public/ (el proxy es fallback innecesario)

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
