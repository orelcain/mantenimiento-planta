# Mantenimiento Industrial — PWA

> Sistema de mantenimiento industrial para plantas de procesamiento de pescado.
> PWA con soporte offline, monorepo Turbo, React + Vite + Firebase.

## Rutina de sesión (OBLIGATORIO — aplica a Claude Code desktop y claude.ai web)

### 🟢 INICIO — Flujo de 2 pasos

**Paso 1** — Cuando el usuario envíe un saludo o mensaje genérico (`hola`, `buenas`, `hi`, etc.) como primer mensaje, responder SIEMPRE con `AskUserQuestion` preguntando:

**¿Qué hacemos hoy?**
1. Proyecto mantenimiento-planta — continuar desarrollo
2. Otro proyecto de desarrollo
3. Conversación libre — consulta, brainstorming, sin contexto de proyecto

Si el primer mensaje YA es una instrucción específica (`arregla X`, `agrega Y`) → saltarse el menú y ejecutar directo.

**Paso 2A — Si elige mantenimiento-planta**, preguntar inmediatamente con otro `AskUserQuestion`:

**¿Por dónde empezamos?**
1. Sync rápido — `git pull` + resumen commits nuevos (Claude Code desktop) / revisar últimos commits en GitHub (claude.ai web)
2. Auditar deploys — `gh run list --limit 20` o revisar GitHub Actions
3. Revisar pendientes — leer sección "Pendientes priorizados" de este archivo
4. Otra cosa — el usuario describe

Si elige múltiples opciones (`los 3`, `todos`, `1 y 2`) → ejecutarlas EN PARALELO en un solo bloque multi-tool y presentar resumen unificado: SYNC (commits nuevos) / DEPLOYS (estado por workflow) / PENDIENTES (P0/P1 activos).

**Paso 2B — Si elige otro proyecto** → preguntar cuál es y su ruta/repo, aplicar la misma lógica.

**Paso 2C — Si elige conversación libre** → proceder normalmente sin cargar contexto de proyecto.

### 🔴 CIERRE

Cuando el usuario diga `cerrar`, `terminar`, `ya está`, `gracias`, `hasta luego` o similar, ofrecer vía `AskUserQuestion`:

1. **Cierre formal** (skill `cerrar-sesion`) — actualizar CLAUDE.md (pendientes completados/nuevos, notas) + commit descriptivo + push
2. **Solo commit + push** — sync sin actualizar docs
3. **Cerrar sin sincronizar** — si los cambios son experimentales o ya están en GitHub

### Notas

- Esta rutina es la fuente única de verdad para ambos entornos (Claude Code desktop y claude.ai web).
- En claude.ai web, Claude lee este CLAUDE.md automáticamente al abrir el proyecto conectado a GitHub.
- En Claude Code desktop, el hook `SessionStart` en `~/.claude/hooks/session-start-rutina.json` refuerza la misma rutina.

---

## Reglas de desarrollo

- **Idioma**: Siempre responder en **ESPAÑOL**. Ahorrar tokens.
- **Ruta única**: `D:\a\APP leventamiento de insidencias en planta\` — único clon git local. NO existe clon en OneDrive (eliminado 2026-04-09, era legacy con drift de 240 commits).
- **Sync**: solo `git push origin main` — el otro PC del trabajo accede via claude.ai conectado a GitHub directamente, no necesita carpeta sincronizada.
- **Commits**: En inglés, prefijos convencionales (`feat:`, `fix:`, `docs:`, etc.)
- **No crear README.md ni docs** salvo que se pida explicitamente.
- **Base URL**: `/mantenimiento-planta/` (GitHub Pages)
- **Deploy**: GitHub Pages via `gh-pages` branch + Firebase Hosting

### Arquitectura de almacenamiento

```
GitHub (orelcain/mantenimiento-planta) ← FUENTE DE VERDAD ÚNICA
              ▲
              │ git push (al cerrar sesión)
              │
        D:\a\... (este PC, único clon local)
```

- **Backup**: GitHub. Si el PC se corrompe, `git clone` y listo.
- **PC trabajo**: claude.ai accede directo a GitHub, sin carpeta local ni OneDrive.
- **No usar OneDrive para código**: rompe `node_modules` y pelea con `.git/objects`. Si quieres backup extra, usar 1 zip mensual del proyecto sin node_modules.

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
| `matar-pendientes` | **USAR AL INICIO.** Leer CLAUDE.md, clasificar pendientes, proponer plan de ataque. **Paso 0 obligatorio**: invoca `auditar-deploys` antes de cualquier feature |
| `cerrar-sesion` | **USAR AL FINAL.** Actualiza CLAUDE.md, sugiere skills, crea memoria |

### Deploy y CI
| Skill | Uso |
|-------|-----|
| `deploy-produccion` | Deploy completo a GitHub Pages con bump de version |
| `fix-ci` | Diagnosticar y reparar fallos de CI (tsc, eslint, build, GitHub Actions) |
| `auditar-deploys` | **Health check standalone** de todos los workflows CI/CD. Detecta workflows bloqueados, degradados o inactivos. Existe porque en 2026-04-09 hubo 18 dias con `deploy-functions` bloqueado sin notarlo |

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

### Módulos específicos
| Skill | Uso |
|-------|-----|
| `grader-diario` | Guia de trabajo con el modulo Grader en turno real: flujo Matrix→análisis, KPIs, Tendencia, IA, cuándo actuar |

### Calidad de código
| Skill | Uso |
|-------|-----|
| `audit-unused-locals` | Detectar y eliminar vars/funciones huérfanas tras refactors. Previene fallos CI por `noUnusedLocals`. Incluye gotcha TypeScript 6 vs 5.7 |

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

- **v2.73.0** (2026-04-09c) — "Learning Hub + P1.5 input validation + P2/P3 quick wins"
- Proyecto Firebase: `mantenimiento-planta-771a3`
- GitHub: `orelcain/mantenimiento-planta`
- Produccion: `https://orelcain.github.io/mantenimiento-planta/`
- CI status: 4/4 workflows 🟢 (Deploy PWA, Deploy Functions, Deploy Firestore Rules, Daily Sync)
- Seguridad: 23 colecciones Firestore validadas, 0 vulnerabilidades runtime prod

## Cambios recientes (sesion 2026-04-10 tarde — Grader refactor + CI fix, 7 commits)

### Módulo Análisis Grader — rediseño completo para uso diario en planta

**fix(grader): parser bugs con datos reales de Matrix** (`1afd476`)
- `normalizeQuality`: 'CALIDAD D' (formato Matrix) → 'D' (antes → 'Unknown')
- `parseNum`: strip sufijos de unidad ('kg', 'g', 'lb') antes de parsear → fix pesos como '10,91 kg'
- `normalizeCalibre`: '12 - Up lb' → '10-12 lb'; regex generalizado de hardcoded '10-UP' a cualquier 'N-UP'

**feat(grader): single-page flow** (`2064738`)
- Elimina wizard de 2 pasos. Página única: upload visible, gates colapsable, alertas + dashboard automáticos
- Alertas (critical/warn) aparecen de inmediato al cargar archivos sin necesidad de navegar
- `onApplyGateSuggestion` ahora abre el acordeón de compuertas en lugar de cambiar de paso

**refactor(grader): dropzone unificado + auto-análisis** (`8722053`)
- Una sola zona de drop para PP y P0 simultáneos (auto-detección por columnas)
- Auto-análisis: `useRef` estable para `onComplete` + `useEffect` en `files` — se dispara solo al detectar PIEZA_PIEZA
- Banner de turno con estilo emerald, warning "Sin Puerta 0" mejorado
- Elimina `dragOverP0` state, `inputRefP0` ref, botón "Usar archivos cargados"

**refactor(grader): UI facelift** (`075863b`)
- Dashboard: `onBack` opcional, botón de volver oculto cuando está embebido en WizardPage
- Action bar: Guardar Sesión primero, exports agrupados, JSON reducido a solo ícono
- KPIs: `text-xl` + `tabular-nums` para lectura rápida
- WizardPage: alertas muestran TODAS las evidencias y recomendaciones, estado OK mejorado

**refactor(grader): simplify dashboard** (`32e7086`)
- **Drag removido** de pin cards: sin state `draggingPinnedId`, sin `useEffect` global de mouse (~50 líneas)
- **Tab "Distribuciones" ocultado** (redundante con KPIs + Matriz Q×C). Tabs: 7 → 6
- **Tabs renombrados** al lenguaje del operador: "Balance Gates" → "Compuertas", "Diagnóstico" → "Sugerencias"
- **HHI humanizado**: badge "Concentración: Alta ⚠ / Media / Baja ✓", celdas muestran texto no número
- **Historial IA colapsado**: última corrida siempre visible, corridas anteriores tras toggle "Ver historial (N)"

**fix(ci)**: 2 commits (`77099a3`, `fd2d5cb`) para corregir 2 funciones huérfanas + TypeScript versión

### Gotcha crítico: TypeScript version mismatch local vs CI
- **Entorno local**: TypeScript 6.0.2 instalado globalmente (`npx tsc`)
- **CI**: TypeScript 5.7.x (lo que pide `package.json: "^5.7.2"`)
- TS 6 trata `baseUrl` como error TS5101 (exit code 2). TS 5.7 solo warning → CI pasaba.
- `ignoreDeprecations: "6.0"` es inválido para TS 5.7 (no conoce deprecaciones de la v6) → rompe CI.
- **Regla**: no agregar opciones tsconfig que solo existan en versiones > la del package.json.
- **Para diagnosticar errores CI reales**: buscar variables/funciones declaradas pero no usadas tras quitar código.

### Gotcha: funciones huérfanas tras refactors
- Al eliminar código (drag handlers, secciones enteras), siempre buscar helpers que SOLO se usaban ahí.
- `estimatePinnedCardHeight`: calculaba altura para drag bounds — quedó sin uso al quitar drag.
- `hasExplicitSourceInWhy`: validación AI — estaba declarada pero nunca llamada (bug previo al refactor).
- `noUnusedLocals: true` en tsconfig lo detecta en CI. Grep: `grep -n "nombreFuncion"` para confirmar.

## Cambios recientes (sesion 2026-04-10 mañana — P3 completo)

### P3 finalizado — Node 24, fast-refresh, lockfile seguridad
- **Node.js 20 → 24** en los 4 workflows: `deploy.yml`, `deploy-functions.yml`, `daily-sync.yml`, `deploy-firestore-rules.yml` (este último no tenía setup-node explícito, se agregó).
- **TerrainMesh fast-refresh**: `useTerrainData` extraído a `useTerrainData.ts` propio. `TerrainMesh.tsx` ahora solo exporta el componente → 0 warnings fast-refresh.
- **Dependabot lockfile 7→1**: edición quirúrgica directa del `pnpm-lock.yaml` (sin `pnpm install` por CDN SheetJS 403 en entorno web):
  - `@xmldom/xmldom` 0.9.8 → 0.9.9 (mammoth; override ya definido, lockfile no se había regenerado)
  - `minimatch` 10.1.1 → 10.2.5 (4 paquetes de eslint)
  - `picomatch` 4.0.3 → 4.0.4 (anymatch, micromatch, readdirp)
  - Restante: `rollup@4.54.0` HIGH via vite-plugin-pwa (devDep build-only)
- **CLAUDE.md limpiado**: P2 contenido Seguridad/Marel removido (decidido no continuar), P3 totalmente marcado.

### Gotcha: SheetJS CDN 403 en entorno web
- `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` retorna 403 en Claude Code Web.
- `pnpm install --no-frozen-lockfile` falla en entorno web por este motivo.
- **Workaround**: editar el lockfile directamente cuando los paquetes de reemplazo ya existen en él.
- **En PC local / CI**: el CDN es accesible y `pnpm install` funciona normalmente.

## Cambios recientes (sesion 2026-04-09 tarde — P1.5 + P2/P3, 8 commits)

### Sesión P1.5 completada + P2/P3 quick wins
- **P1.5 — Input validation Firestore completo**: 4 lotes × 4 colecciones = 16 nuevas colecciones con `isValid*()` en `firestore.rules` (spareParts, bodega, bodega_inventarios, machineCategories, machines, failurePredictions, rootCauseAnalysis, models3d, ariaLearning, ariaActions, ariaKnowledge, ariaEquipmentPatterns, ariaCorrections, mapLocations, roles, inviteCodes). Total project: 23 colecciones validadas (7 previas + 16 nuevas). Commits `162e0d1e`, `78908d73`, `35262779`, `601d7a00`.
- **P2 — Alto contraste calendario** (`57345d13`): override CSS `.high-contrast` para clases zinc/cyan/amber/violet hardcoded. Beneficio colateral: cualquier otra página con colores hardcoded también mejora. Verificado con 9/9 tests programáticos en preview server.
- **P3 — Warnings exhaustive-deps 10→1** (`f9bf1779`): CI margen pasó de 0 a 9. Arreglados bugs reales (missing deps en useStorage y HmiKnuroPage) + refactors limpios (mover findEquipmentInTree a top-level, extraer loadAllMovimientos del objeto bodega). Único warning restante: TerrainMesh fast-refresh (DX).
- **P2 — Editor sidebar mobile** (`55b81fbc`): handles touch de ~20px → 44×44px (estándar WCAG mobile), TouchSensor delay 250→200ms para drag más responsivo, tolerance 5→8px para permitir jitter del dedo sin cancelar, aria-label en cada handle.

### Gotchas descubiertos esta sesión
1. **CSS hardcoded vs tema**: `CalendarioMantencionPage.tsx` usaba `bg-zinc-*`, `bg-cyan-500/5`, etc. hardcoded en lugar de variables del tema. En lugar de tocar 2885 líneas de JSX, se agregaron overrides CSS scoped a `.high-contrast`. Esto deja el calendario igual en modo normal pero responde al toggle de alto contraste. Regla: cualquier clase Tailwind hardcoded fuera del tema debería tener override en `.high-contrast` si afecta legibilidad.

2. **`git add -A` peligroso en este repo**: hay archivos sueltos de sesiones pasadas en D:\a\ (scripts/*.js, PDFs, HTMLs de experimentos) que nunca se commitearon. Al hacer `git add -A` se agregan todos. Patrón seguro: agregar archivos por nombre explícito, o revisar `git status` antes de cada commit.

3. **ESLint exhaustive-deps con objetos**: cuando un `useEffect` depende de `objeto.metodo`, ESLint sugiere agregar `objeto` completo. La solución limpia es extraer `const { metodo } = objeto` antes del effect, así ESLint detecta la dep correctamente sin causar re-renders innecesarios.

4. **Helper functions dentro de componentes**: ESLint marca como dep faltante. Solución: moverlas a top-level del archivo si no dependen del closure. Patrón: `findEquipmentInTree` ahora vive fuera del componente.

## Cambios recientes (sesion 2026-04-09 noche — maratónica, 8 commits)

### v2.73.0 — Learning Hub admin + seguridad completa + CI desbloqueado

**Commit 123d5244 — Editores admin Centro de Aprendizaje**
- `LearningAdminMachinePage.tsx`: 4 tabs activos (Procedimientos + Manual + Flujos + Diagnostico). Antes solo Procedimientos.
- Nuevos editores: `ManualEditor`, `FlowsEditor`, `DiagnosisEditor` con formularios completos
- Primitives compartidas: `CollectionListView`, `ItemCard`, `FormField`, `FormActions` (~40% menos codigo duplicado)
- `StepImageUploader` en procedimientos: upload a Firebase Storage con compresion WebP + cleanup on delete
- `learningContent.ts`: helpers `uploadLearningImage()` + `deleteLearningImage()`
- `MachineLearningPage.tsx`: renderiza las 4 secciones desde Firestore (Manual/Flujos/Diagnostico tenian placeholder)
- `LearningHubPage.tsx`: counts dinamicos M/P/F/D con badges numericos (antes flags estaticos), icono `GraduationCap` → `BookOpen`
- `OtherLearningModulesStrip.tsx`: componente nuevo con chips navegacion cruzada al fondo de sub-paginas
- Bump 2.72.1 → 2.73.0 (buildDate 2026-04-09c)

**Commits ebe4642c + 17d5ee58 — Fix IAM Cloud Scheduler (18 dias bloqueado)**
- Deploy Firebase Functions fallaba desde 2026-03-22 por error HTTP 403 `cloudscheduler.jobs.update`
- Causa raiz: SA del CI (`firebase-adminsdk-fbsvc@...`) sin rol `Cloud Scheduler Admin`
- **Fix aplicado via gcloud directo** (usuario autentico con `gcloud auth login`, asistente ejecuto `add-iam-policy-binding`)
- `checkClimaPortoAlert` y `purgeSensorReadings` (2 scheduled functions) volvieron al deploy automatico
- Workflow restaurado a `firebase deploy --only functions` simple (antes tenia workaround con deploy selectivo)
- **Ultimo deploy exitoso de functions antes era 2026-03-22** — 18 dias de deploys silenciosamente fallidos

**Commit 17d5ee58 — Skill `auditar-deploys` + integracion**
- Nueva skill `.claude/skills/auditar-deploys/` — health check standalone de TODOS los workflows del repo
- Clasifica cada workflow: 🟢 sano / 🟡 degradado / 🔴 bloqueado (2+ fallas consecutivas)
- Usa `gh run list --limit 30 --json` agrupando por `workflowName`
- Integrada como **Paso 0 obligatorio en `matar-pendientes`** → asi el proximo bloqueo no pasa 18 dias sin detectarse
- El propio skill detecto inmediatamente un workflow `Daily Sync` bloqueado por error de pnpm version mismatch

**Commit 271fbc4a — Bloque A seguridad (CRITICAL + 8 HIGH eliminadas)**
- `daily-sync.yml`: pnpm `9` → `10.33.0` (fix "Multiple versions of pnpm specified")
- `pnpm-workspace.yaml`: agregado override `pdfjs-dist@<4.2.67: '>=4.2.67'` (CVE-2024-4367 arbitrary JS execution)
- `functions/package.json`: nuevo bloque `overrides` con `fast-xml-parser >=5.5.7` (elimina la UNICA CRITICAL del repo), `node-forge >=1.4.0` (4 HIGH), `path-to-regexp >=0.1.13` (1 HIGH), `qs >=6.14.2`, `@tootallnate/once >=3.0.1`
- `apps/pwa/package-lock.json` ELIMINADO: era un lockfile duplicado huerfano del monorepo pnpm que Dependabot escaneaba como fuente de verdad (13k+ lineas de ruido)
- `PDFViewer.tsx` + `ManualSearchModal.tsx`: breaking change de `pdfjs-dist >=4.2` → `page.render()` ahora requiere `canvas` en el parametro
- Regenero `pnpm-lock.yaml` y `functions/package-lock.json` (este ultimo con `--ignore-scripts` porque firebase-admin 13.6.0 intenta rebuildar con gulp)

**Commit 7246b17b — Bloque B seguridad (xlsx + Firebase SDK + pdf.js self-host)**
- **xlsx self-host**: 0.18.5 → 0.20.3 desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` en ambos `package.json` (root + apps/pwa). Elimina CVE-2023-30533 (Prototype Pollution) y CVE-2024-22363 (ReDoS). SheetJS paso a modelo de pago en npm pero mantiene el tgz publico en su CDN oficial
- **Firebase SDK self-host** (Item SW SRI): `apps/pwa/public/vendor/firebase/10.7.1/` con `firebase-app-compat.js` (29 KB) + `firebase-messaging-compat.js` (38 KB) descargados desde `gstatic.com`. `firebase-messaging-sw.js` ahora usa `importScripts('./vendor/firebase/10.7.1/...')`. Elimina dependencia de 3rd-party CDN en el service worker
- **pdf.js self-host**: `apps/pwa/public/vendor/pdfjs/pdf.worker.min.mjs` (1.2 MB) + 168 archivos `cmaps/*.bcmap` para fuentes CJK. `PDFViewer.tsx`, `ManualSearchModal.tsx`, `pdfCache.ts` todos apuntan a `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.worker.min.mjs`. Fix runtime: `cdnjs.cloudflare.com` no tiene el worker `.mjs` para `pdfjs-dist` 5.6.x, por eso los PDFs no renderizaban tras el upgrade del Bloque A

**Commit 6e388f6b — Fix ESLint vendor ignore**
- `eslint.config.js`: agregado `'public/vendor/**'` al `ignores` — el lint intentaba escanear el Firebase SDK minificado como si fuera codigo del proyecto, fallando por globals `define`/`module` no definidos
- Sin este fix el CI #1592 fallo en el step de lint (no llego a deploy — produccion nunca estuvo rota)

### Antes de esta sesion (2026-04-09 manana) — v2.72.1
- Calendario `<thead>` sticky top-0, modulos aprendizaje Seguridad y Marel activados, Editor Sidebar (`/admin/sidebar`) con @dnd-kit, modo alto contraste, preload lightbox, input validation 7 colecciones

## Pendientes priorizados

### P1 — Requiere acceso a Firebase Console / IAM
- [ ] **App Check**: ReCaptchaV3 + enforceAppCheck en Cloud Functions (requiere key de ReCaptcha desde Firebase Console)

### P1.5 — ✅ COMPLETADO 2026-04-09 (sesión siguiente)
- ✅ **Input sanitization Firestore**: 16 colecciones validadas en 4 lotes (162e0d1e, 78908d73, 35262779, 601d7a00). Total: 23 colecciones con isValid*() en firestore.rules. Deploy Firestore Rules 🟢.

### P2 — Mejoras UX futuras
- ✅ **Modo alto contraste en calendario** (57345d13): override CSS `.high-contrast` para clases hardcoded `bg-zinc-*`, `text-zinc-*`, `bg-cyan/amber/violet-500/5`, `bg-*-950/60`. Verificado con 9/9 tests programáticos.
- ✅ **Editor sidebar mobile** (55b81fbc): touch target handles 20px → 44×44px (WCAG), TouchSensor delay 250→200ms, tolerance 5→8px, aria-label en handles.

### P3 — Mantenimiento menor no urgente
- ✅ **Warnings React Hook exhaustive-deps** (f9bf1779): 10 → 1 warning. Margen CI 9.
- ✅ **Node.js 20 → 24** en los 4 workflows GitHub Actions (sesion 2026-04-10).
- ✅ **TerrainMesh fast-refresh warning**: `useTerrainData` movido a `useTerrainData.ts` propio (sesion 2026-04-10).
- ✅ **Dependabot 8→1**: xmldom, minimatch, picomatch corregidos en lockfile. Restante: rollup@4.54.0 HIGH vía vite-plugin-pwa (devDep build-only, requiere hashes de red para actualizar).
- [ ] Rollup 4.54.0 → >=4.59.0 (devDep, via vite-plugin-pwa>workbox-build — requiere `pnpm install` con red para regenerar lockfile)

### Resueltos en sesion 2026-04-09 noche (no volver aca)
<!-- completados
- ✅ Fix IAM Cloud Scheduler (18 dias bloqueado — resuelto via gcloud directo)
- ✅ Deploy Firebase Functions desbloqueado
- ✅ Editor Diagnostico / Flujos / Manual (antes solo Procedimientos)
- ✅ Upload imagenes en pasos de procedimientos (Firebase Storage con compresion WebP)
- ✅ SW SRI: Self-host Firebase SDK en public/vendor/
- ✅ xlsx CVE-2023-30533 + CVE-2024-22363 (self-host 0.20.3 desde cdn.sheetjs.com)
- ✅ fast-xml-parser CRITICAL + node-forge HIGH + path-to-regexp HIGH en functions/
- ✅ pdfjs-dist CVE-2024-4367 HIGH
- ✅ Counts dinamicos hub (antes flags estaticos)
- ✅ Icono hub GraduationCap → BookOpen
- ✅ Strip navegacion cruzada entre sub-paginas aprendizaje
- ✅ Daily Sync workflow (pnpm version mismatch)
- ✅ Skill auditar-deploys + integracion como Paso 0 de matar-pendientes
-->

## Recursos externos importantes

### Service Accounts IAM (Google Cloud)
- **SA del CI**: `firebase-adminsdk-fbsvc@mantenimiento-planta-771a3.iam.gserviceaccount.com`
- **Roles actuales clave**: `firebase.admin`, `cloudbuild.builds.builder`, `iam.serviceAccountTokenCreator`, `storage.admin`, **`cloudscheduler.admin`** (agregado 2026-04-09 para desbloquear deploy de scheduled functions)

### gcloud CLI local
- Ruta: `C:/Users/pc hp/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud`
- Usuario autenticado: `orelcain23@gmail.com` (autenticado 2026-04-09)
- Proyecto activo: `mantenimiento-planta-771a3`
- **Claude puede ejecutar comandos gcloud desde Bash** (IAM, Firestore, etc.) — no se requiere Firebase Console para la mayoria de operaciones

### Self-hosted assets en `apps/pwa/public/vendor/`
- `firebase/10.7.1/` — Firebase SDK para el service worker (2 archivos, ~67 KB)
- `pdfjs/pdf.worker.min.mjs` — pdf.js worker (1.2 MB, pdfjs-dist 5.6.x)
- `pdfjs/cmaps/` — 168 bcmaps para fuentes CJK (~200 KB total)
- **IMPORTANTE**: estos estan en `eslint.config.js` ignore. NO deben ser lintados ni modificados manualmente. Para actualizar: re-descargar desde CDN oficial y bumpear path de version.

## Cambios recientes (sesion anterior — v2.72.1, 2026-04-09 manana)

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

### P0 — Grader: mejoras para uso diario en producción (próxima sesión)
- [ ] **Panel proyección turno** (tab Tendencia): tarjeta prominente al top con tiempo restante, P0 proyectado al cierre (color-coded), piezas proyectadas, tendencia ↑↓→ del peso
- [ ] **Chart de peso simplificado**: toggle "Modo simple" (observed+projected) / "Modo detallado" (+MA5+σ) — por defecto simple
- [ ] **Badge P0 cierre prominente**: mover "Proyección Punto Cero cierre: X piezas (Y%)" de texto pequeño bajo chart → badge/KPI destacado en el header de la card
- [ ] **Umbrales colapsables**: wrappear inputs de P0 warn/crítico en sección "Ajustar umbrales" colapsable por defecto
- [ ] **IA Tendencia**: mejorar visualización de sugerencias automáticas, integrar análisis de patrones multisesión
- [ ] **Comparativa turno día/noche**: detectar si hay datos de ambos turnos y mostrar diferencias de P0, calibre, peso
- [ ] **Degradación de sensores**: detectar si un mismo error (fotocélula, fuera de límites) se repite creciendo en el tiempo

### P1 — Requiere acceso a Firebase Console / IAM
- [ ] **App Check**: ReCaptchaV3 + enforceAppCheck en Cloud Functions

### P1.5 — Seguridad pendiente
- [ ] **SW SRI**: Self-host Firebase SDK en public/vendor/ (evitar 3rd-party scripts)
- [ ] **Input sanitization Firestore**: quedan ~18 colecciones sin validacion de tipos (spareParts, bodega, machineCategories, machines, ariaLearning, etc.)

### P2 — Mejoras UX futuras
- [ ] **Contenido real Seguridad**: agregar fichas PDF descargables, videos de EPP al modulo `/aprendizaje/seguridad`
- [ ] **Contenido real Marel**: agregar guias por equipo (MX, Stork Trim, Scanvaegt) con fotos
- [ ] **Modo alto contraste en calendario**: la tabla del calendario no reacciona al `.high-contrast` (colores hardcoded en bg-zinc-800, bg-cyan-500/5, etc.)
- [ ] **Editor sidebar — reordenar grupos en mobile**: el TouchSensor funciona pero puede ser mejorado
- [ ] **UX Aprendizaje — icono hub**: `GraduationCap` → `Wrench` o `BookOpen` (comunica mejor "manuales tecnicos" a un mecanico industrial) — auditoria 2026-04-09
- [ ] **UX Aprendizaje — navegacion cruzada**: agregar franja "Otros modulos" al fondo de cada sub-pagina (chips de navegacion rapida sin volver al hub) — auditoria 2026-04-09

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

### Módulo Análisis Grader — contexto para próxima sesión

**Objetivo del módulo**: Soporte de decisiones en tiempo real para operadores de clasificadora (grader) de salmones durante un turno activo. Se sube un Excel exportado del software Matrix y el sistema sugiere cambios de compuertas, limpieza de sensores, recalibración.

**Arquitectura de datos**:
- `PIEZA_PIEZA`: fuente de verdad (peso, calibre, calidad, gate, lote, timestamp)
- `PUERTA_0`: enriquece razones de rechazo (fotocélula, fuera de límites, etc.)
- Gate 0 = "Punto Cero" = rechazados. 12 gates activas.
- El % de P0 es el KPI principal del turno.

**Archivos clave**:
- `AnalisisGraderWizardPage.tsx` — página contenedora (upload + gates + dashboard)
- `AnalisisGraderUploadPage.tsx` — dropzone unificado con auto-análisis
- `AnalisisGraderDashboardPage.tsx` — dashboard completo (~4500 líneas)
- `services/grader/graderAnalytics.ts` — motor de cálculo KPIs, distribuciones, HHI
- `services/grader/graderInsights.ts` — insights deterministas + tendencia P0
- `services/grader/types.ts` — tipos (ParsedMatrixData, GateAssignment, etc.)

**Tab Tendencia** (foco principal próxima sesión):
- `trendForecastView` useMemo: proyección turno completo via regresión lineal
  - Produce: `projectedPointZeroPct`, `projectedTotalPieces`, `completionPct`, `shiftStart/EndLabel`
- `trendAutoRecommendations`: sugerencias de gate swap basadas en P0 proyectado vs umbrales
- Mejoras pendientes: ver sección P0 en pendientes priorizados

**TypeScript gotcha (IMPORTANTE)**:
- Localmente hay TS 6.0.2. El proyecto usa TS 5.7.x. NO agregar `ignoreDeprecations: "6.0"` al tsconfig.
- Siempre verificar que `noUnusedLocals` pase: al eliminar código buscar helpers huérfanos con grep.
