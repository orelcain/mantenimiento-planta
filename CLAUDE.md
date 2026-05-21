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

## Gestión dinámica de modelo — Haiku 4.5 ⇄ Sonnet 4.6 ⇄ Opus 4.7 (v0.1 — 2026-04-18)

**Nivel de esfuerzo va según naturaleza de tarea.** El asistente auto-clasifica cada turno y **sugiere al usuario** cambiar modelo (`/model haiku|sonnet|opus`) cuando conviene. Si el modelo actual es óptimo, ejecuta en silencio.

| Naturaleza de la tarea | Modelo | Esfuerzo |
|---|---|---|
| Diseño arquitectura / UX / plan técnico | **Opus 4.7** | normal |
| Debug complejo (root cause, race conditions) | **Opus 4.7** | normal |
| Brainstorming, trade-offs, auditorías | **Opus 4.7** | normal |
| Refactor con decisiones | **Opus 4.7** planea → Sonnet ejecuta | — |
| Review de PRs / código | **Opus 4.7** | normal |
| Implementar un plan ya escrito (DoD claro) | **Sonnet 4.6** | normal |
| Edits mecánicos (migrar tipos, renombrar) | **Sonnet 4.6** | normal |
| Tests unitarios simples | **Sonnet 4.6** | normal |
| Commits + push + verificar CI | **Sonnet 4.6** | normal |
| Bug fixes mecánicos con diagnóstico claro | **Sonnet 4.6** | normal |
| Batch de ediciones en cadena | **Sonnet 4.6** | normal |
| Lectura exploratoria simple (¿existe X?) | **Haiku 4.5** | — |
| Queries de estado corto (git status, ¿CI?, versión) | **Haiku 4.5** | — |
| Formatear / convertir | **Haiku 4.5** | — |

### Batching — agrupar tareas del mismo tipo

Para reducir cambios de modelo: al planear una fase, identificar bloques contiguos del mismo modelo y ejecutarlos juntos. Ejemplo típico:

```
Batch 1 (Opus 4.7, ~20 min)   Diseño + doc del plan
         ↓ handoff: "plan listo, `/model sonnet`"
Batch 2 (Sonnet 4.6, ~2h)     Implementación + commits + push
         ↓ handoff: "código verde, `/model haiku`"
Batch 3 (Haiku 4.5, ~5 min)   Verificar CI + confirmar deploy
```

### Restricciones

- El asistente **no puede** invocar `/model` ni `/fast` — son comandos del cliente Claude Code. Solo **sugiere con aviso breve**.
- Prompt cache se pierde al cambiar modelo → vale la pena sólo cuando el batch siguiente es suficientemente largo.

### Evolución del framework

**v0.1 (hoy):** tabla estática + avisos manuales. Lo iteramos sesión tras sesión observando qué avisos fueron útiles vs ruidosos.

**Detalle completo + protocolo paso a paso:** ver memoria global `feedback_modelo_por_tarea.md`.

---

## Reglas de desarrollo

- **Idioma**: Siempre responder en **ESPAÑOL**. Ahorrar tokens.
- **Ruta única**: `D:\a\APP leventamiento de insidencias en planta\` — único clon git local. NO existe clon en OneDrive (eliminado 2026-04-09, era legacy con drift de 240 commits).
- **Sync**: solo `git push origin main` — el otro PC del trabajo accede via claude.ai conectado a GitHub directamente, no necesita carpeta sincronizada.
- **Commits**: En inglés, prefijos convencionales (`feat:`, `fix:`, `docs:`, etc.)
- **Version bump OBLIGATORIO en cada push a producción**: antes de cada `git push origin main`:
  1. Editar `apps/pwa/package.json` → campo `"version"`
  2. Editar `apps/pwa/src/constants/version.ts` → `APP_VERSION` + `VERSION_NAME`
  3. **Correr `node scripts/sync-pwa-version.mjs`** desde la raíz del repo → actualiza `public/version.json` y `VERSION.md` (sin esto el banner de actualización muestra versión incorrecta)
  - Usar versionado semántico: `feat` → minor (2.90 → 2.91), `fix`/`docs` → patch (2.90.0 → 2.90.1)
  - La versión aparece visible en la UI (header del sidebar). Versión actual: **v2.92.0**
  - ⚠️ El script `sync:version` corre automático en prebuild del CI, pero NO al hacer commits manuales → siempre correrlo a mano.
- **No crear README.md ni docs** salvo que se pida explicitamente.
- **Base URL**: `/mantenimiento-planta/` (GitHub Pages)
- **Deploy**: GitHub Pages via `gh-pages` branch + Firebase Hosting

### Principios de UI/UX — establecidos sesión 2026-04-25

> *"que los gráficos revelen información útil y fácil de entender, no solo mostrar datos por que sí"*

1. **Información útil, no datos por que sí.** Antes de agregar un gráfico/KPI/badge,
   responder: *¿qué decisión opera el usuario al verlo?* Si la respuesta es "ninguna",
   sacarlo. Métricas académicas (R², slope numérico) deben acompañarse de magnitud
   operacional ("cada -10 ciclos → +N pts P0%") o reemplazarse por un KPI accionable
   ("Zona crítica: N de M min").

2. **Consistencia entre elementos.** Un mismo concepto debe llamarse igual, calcularse
   igual y verse igual en todos los componentes:
   - **Umbrales operacionales** (ej. P0 crítico = 3.5%) → constante exportada de un
     único módulo. Si aparece hardcoded en 2 archivos, refactor a constante compartida.
   - **Etiquetas semánticas** (alta/media/baja, crítico/warning/recommended,
     verde/amarillo/rojo) → reutilizar helpers existentes (`confidenceLabel()`,
     `criticalColor()`). No inventar nuevos labels para el mismo eje.
   - **Categorías cross-sistema** (tags Grader vs reasons Baader): mantener listas
     parejas en helpers compartidos (`isPlannedBaaderReason()`,
     `isOrganizationalGraderPause()`).
   - **Convenciones temporales** — Shoplogix guarda wall-clock-as-UTC; usar
     `getUTCHours/Minutes/Seconds` siempre. Documentar al tope del componente.
   - **Antes de inventar un umbral nuevo**: `grep` por el concepto en el módulo. Si
     existe, reutilizar; si difiere, decidir cuál es correcto y unificar.

3. **Cautela y atención al detalle.** Cambios contenidos, helpers extraídos a archivos
   testables, tests para cada función pura nueva (incluir edge cases observados:
   float-math, valores vacíos, contributors faltantes en backward compat).

4. **Auditar antes de agregar.** Antes de construir un componente nuevo, auditar los
   existentes con el método: *qué decisión opera, qué datos ya tenemos, dónde caen los
   falsos positivos*. Suele resultar en mejoras de los existentes en lugar de uno nuevo.

### Preview y pruebas visuales (OBLIGATORIO leer antes de usar browser)

**Regla principal: verificar en preview SIEMPRE después de cada avance**, antes de hacer commit.
No asumir que "compila = se ve bien". Cada feature, fix o cambio de layout se confirma visualmente.

**Flujo canónico por avance:**
1. Hacer los cambios de código
2. `preview_start("pwa-dev")` → arranca/reutiliza el Vite dev server
3. `preview_eval` con `window.location.href = 'URL'` para navegar al módulo
4. `preview_screenshot` → ver resultado visual
5. `preview_snapshot` → accessibility tree si se necesita verificar DOM
6. `preview_click` / `preview_eval` para interactuar
7. Solo si se ve bien → `pnpm exec tsc --noEmit` + commit + push

**Detalles técnicos:**
- Navegador instalado: **Microsoft Edge** — tier "read" (solo screenshots, sin clicks/typing)
- Para interactuar con la app usar **`mcp__Claude_Preview__*`** (preview server interno de Claude)
- **NUNCA usar `mcp__computer-use__*` para pruebas de la app** — Edge es read-only
- Dev server: `localhost:5173` · base path: `/mantenimiento-planta/`
  → URL: `http://localhost:5173/mantenimiento-planta/<ruta>?<params>`
- `preview_start` con nombre `"pwa-dev"` para reutilizar el server entre avances

**⚠️ FALSO POSITIVO recurrente — `preview_list` muestra cwd OneDrive:**

Cuando `preview_list` retorna `cwd: C:\Users\pc hp\OneDrive\ANTARFOOD`, NO significa que el preview esté ignorando los cambios de `D:\a\...`. El `cwd` reportado es solo el directorio donde se invocó `preview_start`; el dev server real corre desde D:\a\ porque el `runtimeArgs` en `.claude/launch.json` contiene `"D: && cd D:\\a\\... && pnpm run dev"`.

**Antes de concluir "los cambios no aparecen", verificar EN ESTE ORDEN:**

1. Leer `.claude/launch.json` (sea el de OneDrive o el de D:\a\) y revisar el comando real. Si arranca desde D:\a\ → todo bien.
2. Revisar `preview_logs` buscando `hmr update` con timestamp reciente del archivo editado. Si hay HMR update → cambio aplicado.
3. **Console errors antiguos engañan**: el buffer histórico del navegador retorna stack traces con un `t=...` query param. Si ese timestamp es viejo (anterior al último HMR), el error es STALE — no del código actual.
4. Tras un fix, recargar con `preview_eval window.location.reload()` + esperar 2-3s + volver a leer `preview_console_logs level: error`. Solo errores con timestamp posterior al reload son válidos.
5. Si la app SÍ renderiza nuevos contenidos en el screenshot → el preview está bien, el "no veo cambios" es un falso positivo. Investigar la lógica de datos/estado en el código, no el preview.

Esto sucedió ≥3 veces. NO desperdiciar turnos reiniciando preview ni asumiendo que está "leyendo OneDrive".

### Verificación pre-push (OBLIGATORIO)

**TSC y ESLint deben correrse desde `apps/pwa/`** — NO desde la raíz del monorepo.
La raíz no tiene `tsconfig.json` propio, así que `pnpm exec tsc --noEmit` desde root
solo imprime el help y devuelve exit 0 (engañoso). El CI corre con
`working-directory: apps/pwa`, por eso fallan deploys que parecían "verde local".

Comandos canónicos antes de push:

```bash
cd apps/pwa
pnpm exec tsc --noEmit                    # TSC strict mode (CI usa esto)
pnpm exec eslint . --max-warnings 10      # Lint (CI usa esto)
cd ../..
pnpm --filter pwa exec vitest run         # Tests
```

Errores típicos que SOLO aparecen en CI con la config strict:
- TS6133: imports no usados → eliminar
- TS2345/TS2322 con `noUncheckedIndexedAccess`: `array[idx]` puede ser `undefined`
  → guard con `if (!x) return` o usar non-null assertion `array[idx]!` cuando se
  acaba de validar `idx < array.length`
- Spread con literales: `{ ...base, autoTag: 'cambio_lote' }` → TS pierde el literal
  type. Usar `as const` o cast al tipo unión.

Si olvidás esto, los deploys fallan en cadena (sucedió 12 veces consecutivas en
sesión 2026-04-25 antes de detectarlo).

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
sidebarConfig
notificationConfig  ← config notif Shoplogix por planta
shoplogixNotifState ← dedup state por máquina-turno (solo backend)
shoplogixShiftDelayChecks ← control alertas inicio turno (solo backend)
animelists          ← ⚠️ EXTERNO — no tocar. Usado por bot @anime_estreno_bot
```

### 🤖 Bot `@anime_estreno_bot` — vive dentro de este repo

El bot Telegram personal de Danigo **`@anime_estreno_bot`** (display: AnimeTracker) está implementado dentro de este monorepo. NO es un proyecto separado a pesar de su nombre.

**Componentes del bot en este repo:**
- **Backend:** `functions/index.js` — Cloud Functions deployadas en `mantenimiento-planta-771a3`:
  - `telegramWebhook` (≈línea 2972) — recibe updates de Telegram (long-running HTTPS)
  - `setTelegramWebhook` (≈3127) — configura URL del webhook
  - `setupTelegramTopics` (≈3200) — setup topics de grupo
  - `mintTelegramAuthToken` (≈3271) — emite tokens auth para la Mini App (firma para validar `initData` Telegram)
  - `animeEstrenosDiarios` (≈4510) — scheduled diario, notifica películas/OVAs/specials que estrenan hoy
  - `animeEstrenosManual` (≈4526) — trigger HTTP manual del mismo
- **Mini App:** `apps/pwa/public/anime.html` (3000 líneas) — UI Telegram WebApp. Carga `telegram-web-app.js` + Firebase JS SDK
- **Hosting:** `https://mantenimiento-planta-771a3.web.app/anime.html`
- **Datos:** colección Firestore `animelists/{userId}` (ver rule actual línea ~1341 `firestore.rules`)
- **Auth:** `mintTelegramAuthToken` valida `initData` de Telegram y emite custom token Firebase
- **Estado actual rules:** `allow read, write: if true` para `animelists` (sin auth, asume bot personal)

**Implicaciones de tocar este código:**
- **Modificar `firestore.rules`:** preservar acceso a `animelists` o el bot se cae silenciosamente
- **Modificar `functions/index.js`:** las 6 functions del bot conviven con las 25+ functions de la PWA. Cuidado al refactorizar o renombrar exports
- **Modificar `apps/pwa/public/anime.html`:** afecta directamente la Mini App en producción al hacer deploy de hosting
- **Bot Token y secrets:** viven en Firebase Functions config (`firebase functions:config:get`), no en código

**Backup histórico (Node-RED v0):** `github.com/orelcain/anime-estreno-bot-nodered-archive` (privado) — captura cómo era el bot ANTES de migrar a Cloud Functions (mediados 2025). NO restaurar como bot funcional — duplicaría el bot que ya corre 24/7.

## Skills disponibles (.claude/skills/)

### Flujo de sesion
| Skill | Uso |
|-------|-----|
| `matar-pendientes` | **USAR AL INICIO.** Leer CLAUDE.md, clasificar pendientes, proponer plan de ataque. **Paso 0 obligatorio**: invoca `auditar-deploys` antes de cualquier feature |
| `cerrar-sesion` | **USAR AL FINAL.** Actualiza CLAUDE.md, sugiere skills, crea memoria |
| `bump-version` | **Llamar desde cerrar-sesion.** Sincroniza versión en `version.ts` + `package.json` + `version.json` + CLAUDE.md en un paso |

### Deploy y CI
| Skill | Uso |
|-------|-----|
| `deploy-produccion` | Deploy completo a GitHub Pages con bump de version |
| `fix-ci` | Diagnosticar y reparar fallos de CI (tsc, eslint, build, GitHub Actions) |
| `auditar-deploys` | **Health check standalone** de todos los workflows CI/CD. Detecta workflows bloqueados, degradados o inactivos. Existe porque en 2026-04-09 hubo 18 dias con `deploy-functions` bloqueado sin notarlo |

### Seguimiento de deploys — protocolo obligatorio
Después de cada `git push`, verificar con `gh run list --limit 5` que el workflow **Deploy PWA to GitHub Pages** quede verde.
- Si falla: `gh run view <run_id>` para ver el log del paso que falló
- Un deploy fallido no bloquea si el siguiente push lo supera (GitHub Pages usa el último deploy exitoso)
- Histórico actual: fallo puntual en commit `f7f9176` (2026-04-27) — superado sin impacto en producción

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
| `grader-historico` | Construir el archivo histórico Grader desde cero: qué exportar de Matrix, orden de carga PP→P0, verificar calendario, troubleshooting de errores comunes |

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

- **v3.30.0** (2026-05-16) — "feat(hmi-yal): validador manual con video real + paint mode + snapshots persistentes"
- Proyecto Firebase: `mantenimiento-planta-771a3`
- GitHub: `orelcain/mantenimiento-planta`
- Produccion: `https://orelcain.github.io/mantenimiento-planta/`
- CI status: 4/4 workflows 🟢
- Seguridad: 26 colecciones Firestore validadas, 0 vulnerabilidades runtime prod

## Cambios recientes (sesión 2026-05-03 — Shoplogix Notification System + dedup fix)

### Sistema de notificaciones Shoplogix (Cloud Functions + Admin UI)

**Commits**: `22ffca78` (feat) + `da8c98a2` (fix dedup)

#### Cloud Functions (`functions/index.js`)

Nuevo trigger `onShoplogixMachineUpdated` — dispara en cada actualización de `shoplogix/{plant}/shifts/{shiftDoc}/machines/{machineId}`:

- **Tipos de notificación**:
  - Primera pieza por Baader (`firstPiece.enabled`) — cuando `cyclesBefore=0 && cyclesAfter>0`
  - Hito de piezas (`pieceInterval.enabled`, `every`) — cada N piezas multiplicadas
  - Detención (`events.stoppage`) — cada `states[type=downtime]` nueva
  - Micro-detención (`events.microStoppage`) — cada downtime con "micro" en nombre
- **Canales**: FCM push (default ON) + Telegram (default OFF), configurables por planta
- **Modificado `onShoplogixShiftStarted`**: ahora usa config y crea `shoplogixShiftDelayChecks`
- **Nueva función `checkShiftStartDelays`** (scheduled cada 5 min): verifica turnos sin piezas después del grace period

#### Fix deduplicación (race condition)

**Causa raíz**: `syncDay` escribe DOS veces cada machine doc (main data + `dataQualityIssues`) → 6 invocaciones concurrentes. Eventarc puede duplicar aún más.

**Fix**: `db.runTransaction()` en torno al read/write de `shoplogixNotifState` — solo 1 invocación gana el lock, las demás re-leen el estado ya actualizado y retornan `toSend=[]`.

**Baseline isFirstRun**: cuando el state doc no existe, se inicializa con los contadores actuales (sin notificar) para evitar catch-up histórico al deployar mid-shift.

**Resultado test 2026-05-03 21:43**: 9 invocaciones concurrentes → 1 notificación exacta (`⛔ Detención · YAL Evisceradora 3`) con `count:1`. Cero duplicados.

#### Admin UI (`apps/pwa/src/`)

- **`services/shoplogix/shoplogixNotifConfig.service.ts`** (NEW): tipo `ShoplogixNotifConfig` + load/save en `notificationConfig/{plantSlug}`
- **`pages/admin/ShoplogixNotificationsConfigPage.tsx`** (NEW): tabs por planta, 5 cards de config (canales, inicio turno, primera pieza, hitos, eventos)
- **`pages/admin/AdminPanelPage.tsx`**: item "Notificaciones Shoplogix" con icono Bell naranja
- **`App.tsx`**: ruta `admin/notifications-shoplogix` con `AdminRoute + RequireReAuth`
- **`firestore.rules`**: `notificationConfig` (read:auth, write:admin) + `shoplogixNotifState`, `shoplogixShiftDelayChecks` (read+write: false — solo backend)

#### Nuevas colecciones Firestore

| Colección | Propósito |
|-----------|-----------|
| `notificationConfig/{plantSlug}` | Config por planta (canales, umbrales, eventos) |
| `shoplogixNotifState/{plant}_{shiftDoc}_{machineId}` | Estado de dedup por máquina-turno |
| `shoplogixShiftDelayChecks/{plant}_{shiftDoc}` | Control de alertas de inicio demorado |

---

## Cambios recientes (sesión 2026-04-17 tarde — Grader Producto 3 capas + motor IA sugerencias, v2.112.1 → v2.113.0)

### FASE 1 — Tab Producto rediseñado (progressive disclosure)
- **Hero card**: métricas clave (longitud, peso, cadencia, ratio L/spacing, verdict pill 🟢🟡🔴)
- **`⚙️ Equipo flipper`** (sub-card colapsable, abierta por defecto): timing Z2 + visualizador ciclo
- **`📐 Diagnóstico técnico`** (sub-card colapsable, cerrada por defecto): fórmulas con fuentes + ratios

### FASE 2 — Campos físicos Z2 editables en GraderPhysicalConfig
Nuevos campos opcionales con defaults Z2 reales:
- `flipperDelayOpenMs` (150), `flipperMinOpenTimeMs` (350), `flipperDelayCloseMs` (150)
- `flipperHeightAboveBeltMm` (0.5), `flipperMechanicalResetS`, `flipperMechanicalMeasuredAt`
- `delayBeforeGateCloseMs` (400), `delayGateCloseMs` (500), `minGateOpenMs` (0), `maxBinWeightG` (25000)
- Sub-card A (ciclo flipper) convertida a inputs editables con IIFE pattern

### FASE 3 — Motor IA de sugerencias punto cero (PointZeroSuggestion engine)
Archivos nuevos bajo `src/services/grader/suggestions/`:
- `types.ts` — interfaz `PointZeroSuggestion` (source, formula, dataPoints, confidence, applyFn/ignoreFn)
- `suggestFishBaseLength.ts` — LWR FishBase Salar (a=0.0136 b=2.979) y Coho (a=0.0091 b=3.07)
- `suggestFishBaseWidth.ts` — anchura alométrica (widthRatio 0.26 Salar / 0.24 Coho)
- `suggestPocketCount.ts` — detecta solapamiento L/spacing ≥ 1 + ratio > 0.7
- `suggestResetFreshness.ts` — alerta reset mecánico nunca medido o medido hace >30 días
- `suggestHistoricalCadence.ts` — compara cadencia actual vs avg de últimos N turnos (≥10 required)
- `useSuggestionEngine.ts` — hook orquestador con ignoredIds (useState Set)
Componentes nuevos bajo `src/components/grader/`:
- `SuggestionCard.tsx` — card expandible: 🧠 Por qué / 📊 Datos / 🔬 Fórmula / 🎯 Confianza / ⚠️ Impacto + botones Aplicar/Ignorar
- `SuggestionsPanel.tsx` — panel ordenado warnings→recommended→info con contador

### Nota runtime
Error `Cannot access 'batchStats' before initialization` era HMR stale cache (TSC exit 0, orden correcto: batchStats L548, hook L610). Desaparece al reiniciar Vite dev server.

## Cambios recientes (sesión 2026-04-16 — Mobile home WIP ribbons + QR share, v2.93.0 → v2.94.0)

### Nuevos componentes y hooks
- **`WipRibbon`** (en `MobileHomeGrid.tsx`): banda diagonal amarilla `rotate(38deg)` con texto "EN DESARROLLO". Admin puede tocarla para marcar como lista (overlay de confirmación ✓/✗). Variante `cta` = pill badge inline.
- **`AppShareCard`** (en `MobileHomeGrid.tsx`): accordion al fondo del home móvil. Muestra QR con `QRCodeSVG` de `qrcode.react`, URL de la app, botón "Compartir enlace" (Web Share API + clipboard fallback).
- **`wipOverrides.ts`** (`apps/pwa/src/services/`): servicio Firestore para el doc `appConfig/wipOverrides`. `releaseModule()` / `unReleaseModule()` / `subscribeWipReleased()`.
- **`useWipOverrides.ts`** (`apps/pwa/src/hooks/`): hook con `onSnapshot` reactivo. `isWip(id, staticWip)` = true si staticWip && no está en el set de released. `toggleRelease()` sólo para admin.

### Cambios en MobileHomeGrid.tsx
- **WIP automático de formación**: `wip: !Object.values(m.sections).some(Boolean)` derivado desde `LEARNING_MACHINES` — sin hardcodear, se actualiza solo cuando el admin añade contenido real.
- **Admin sin duplicados**: `HMI_TILES_ADMIN = []` para evitar HMI en Formación. HMI Knuro + HMI Grader sólo en Herramientas.
- **Botón ≡ Menú** en el header del home, a la izquierda del saludo. Llama `useAppStore(s => s.setSidebarOpen)(true)`.

### Cambios en MainLayout.tsx
- **Bottom nav oculto en `/`**: clase `hidden` cuando `location.pathname === '/'`.
- **Sin padding en home**: main usa `p-0 w-full max-w-[100vw] overflow-x-hidden` en `/`, sin `pb-20`.

### Firestore
- Nueva colección: `appConfig/wipOverrides` con campo `released: string[]` — persistencia de módulos liberados por admin.

### Gotchas
- Cherry-pick con refs relativas (`HEAD~1`) puede capturar commits equivocados si el branch tiene commits extras. Usar siempre hash explícito.
- `qrcode.react` v4 ya estaba en package.json (`^4.2.0`) — no requirió instalación extra.

## Cambios recientes (sesión 2026-04-15 — Grader home layout 2 columnas, v2.91.0 → v2.92.0)

Refactor visual del home de Análisis Grader (`AnalisisGraderWizardPage`). Sin cambios de lógica ni datos.

### Nuevo layout pantalla completa (2 columnas)
- **Izquierda (50%)**: `GraderHistoricalCalendar` con nuevo prop `stacked=true` → calendario (1.1) arriba + resumen turno (1.2) abajo, apilados verticalmente
- **Derecha (50%)**: Card "Configuraciones" con `AnalisisGraderGatesConfigPage` en modo `tabbed=true` → 4 pestañas: Análisis | 12 Gates | Rangos | Física
- **Header**: `AnalisisGraderUploadPage` con prop `compact=true` → botón compacto "Cargar Excel" + estado turno inline, sin zona drag-drop ni calendario
- **Eliminado**: stepper de 3 pasos (era solo visual, no aportaba) + todos los badges de debug numerados (1, 1.1, 1.2, 3, 3.1–3.4)

### Props nuevos añadidos
- `GraderHistoricalCalendar`: `stacked?: boolean` — cuando true usa `flex flex-col` en lugar de grid 3 columnas
- `AnalisisGraderGatesConfigPage`: `tabbed?: boolean` — tab bar con `useState<'analisis'|'gates'|'rangos'|'fisica'>`, oculta nav sticky en modo tabbed
- `AnalisisGraderUploadPage`: `compact?: boolean` — early return con botón pequeño en lugar del layout completo

## Cambios recientes (sesion 2026-04-11/12 maratónica — Grader iter 8 al 18.1, v2.80.0 → v2.86.1)

Sesión larga con 13 iteraciones consecutivas del módulo Grader. Cubre desde limpieza de data hasta rebuild completo de la temporada con nuevas métricas de tiempo activo.

### Resumen por iter

- **iter 8 v2.76.0** — dedupe carga masiva (labels canónicos + records solapados)
- **iter 9 v2.77.0** — calendario histórico unificado en el home
- **iter 10 v2.78.0** — detalle de turno + análisis de período
- **iter 11 v2.79.0** — 2 turnos reales (A=día, B=noche) + migración legacy tarde→noche
- **iter 12 v2.80.0** — tendencia P0% + alertas determinísticas + IA desde historial Firestore (drill del detalle de turno)
- **iter 13 v2.81.0** — UI calendar mejorado + fix duración anómala + delete registro
- **iter 14 v2.82.0** — ocultar upload card si ya hay historial o si se borra el summary
- **iter 15 v2.83.0** — eliminadas 4 páginas legacy (Calendar, CargaMasiva, SessionsList, Session) = -1,209 líneas, -4 rutas
- **iter 16 v2.84.0** — drill-down desde gráfico de período al día con `?goto=YYYY-MM-DD`; cards Mejor/Peor día clickeables
- **iter 17 v2.85.0** — gráfico Tendencia separa Turno día (ámbar) y Turno noche (índigo); zoom/pan con chartjs-plugin-zoom; botón Reset zoom
- **iter 18 v2.86.0** — segmenter timestamp-first (ignora label A/B del Excel); hourlyBuckets en summary; rebuild completo de 5.37M PP + 206k P0 → 379 summaries limpios; 0 anómalos
- **iter 18.1 v2.86.1** — fix TZ display (timeZone: 'UTC' en toLocaleTimeString); durationMinutes = minutos activos reales (excluye colación)

### Limpieza de data masiva (scripts Node + firebase-admin)

Se ejecutaron varios scripts en `scripts/` usando `serviceAccountKey.json`:

1. **cleanup-grader-bad-records.js** — borró 1 upload duplicado mal etiquetado (Feb 6 era data jul 2025), 7 ghost records y 3 registros gigantes
2. **migrate-grader-legacy-shifts.js** — consolidó 16 summaries con shiftId "Turno A/B" → canónicos (9 merged, 7 renamed) + borró 3 corruptos con p0 > total
3. **iter18-full-season-rebuild.js** — WIPE + REBUILD completo desde 30 Excel locales en `C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026/`. Processing: 5.37M PP + 206k P0 deduplicados → 383 segmentos → 379 summaries válidos (skipped 4 tiny <100pz)

Distribución final de duración (post iter 18.1): `<6h: 34, 6-10h: 306, 10-13h: 39, >13h: 0` ✅

### Correcciones técnicas críticas

**Timestamp-first segmentation** (`graderSegmenter.ts`):
- Antes: `resolveShiftAndDate` usaba la columna "Turno" del Excel como fuente primaria
- Problema: operarios a veces etiquetan 20-24h seguidas con la misma letra A/B → segmentos ficticios de 24h
- Ahora: `segmentByDayAndShift` SIEMPRE llama `assignShiftAndDate(rec.ts)` basado en el timestamp real
- La columna "Turno" del Excel queda disponible en `rec.shift` por si después se quiere analizar performance por equipo (separado del turno)

**durationMinutes = minutos activos**:
- Antes: `Math.round((new Date(endAt) - new Date(startAt)) / 60_000)` → incluía colación/pausas
- Ahora: `Set<string>` con `ts.slice(0, 16)` (YYYY-MM-DDTHH:MM) → cuenta únicos → tiempo real de operación
- Turno 08:00-18:00 con colación 13-14: antes 10h, ahora 9h reales

**Timezone display bug** (6 archivos):
- El parser guarda timestamps como `"2026-02-16T07:00:03.000Z"` (fake-UTC — son horas locales con sufijo Z)
- `toLocaleTimeString('es-CL')` sin `timeZone` convertía de "UTC" a Chile local, restando 3-4h
- Resultado: "07:00" del Excel aparecía como "04:00 am" en la UI
- Fix: agregar `timeZone: 'UTC'` a todos los `toLocaleTimeString` del grader para mostrar las horas tal cual están guardadas
- Archivos: `GraderHistoricalCalendar.tsx`, `GraderTurnoDetailView.tsx`, `AnalisisGraderUploadPage.tsx`, `AnalisisGraderDashboardPage.tsx`, `GraderPuntoCeroTab.tsx`, `GraderTendenciaTab.tsx`

**Stack overflow en arrays gigantes**:
- `allPP.push(...records)` con 229k elementos → RangeError en V8
- Fix: `for (let i = 0; i < records.length; i++) allPP.push(records[i])`
- Aplicado en scripts y ya existía helper `pushAll()` en el parser del app

### Nuevo campo en GraderDailySummary

```typescript
hourlyBuckets?: Array<{
  hour: number        // 0-23
  totalPieces: number
  p0Pieces: number
}>
```

Permite drill-down "dentro del turno" en el gráfico de tendencia (pendiente UI iter 19). Todos los 379 summaries ya lo tienen (generado en el rebuild).

### Pendientes de esta sesión (para retomar)

1. **Iter 19 — Drill-down hourly en gráfico de tendencia**: cuando el zoom del chart del período muestre ≤ 2 días, cambiar automáticamente a vista "por hora del día" usando los `hourlyBuckets` de los summaries visibles. Permite ver cómo evoluciona el P0% dentro de un turno específico.

2. **KPIs dinámicos según zoom visible**: los KPIs del header del análisis de período (Piezas totales, P0% ponderado, Peso total, etc.) deben recalcularse según el rango visible del chart, no quedarse fijos al rango inicial del preset.

3. **Selectores específicos semana/mes**: los presets actuales son "últimos 7 días / últimos 30 días" (relativos). El usuario pide poder navegar a una semana/mes específico histórico sin tener que usar "Personalizado" (ej. prev/next arrows entre semanas del año).

4. **Deploy iter 12 failed** (ya resuelto): run 24291493515 falló, commit siguiente (`fix TS errors en GraderTurnoDetailView`) deployó sin problemas. La funcionalidad del iter 12 está en producción.

### Gotchas críticos de esta sesión

**Firebase Storage bucket name**:
- Bucket correcto es `mantenimiento-planta-771a3.firebasestorage.app`, NO `.appspot.com`
- Está en `apps/pwa/.env.local` como `VITE_FIREBASE_STORAGE_BUCKET`

**Parser timestamps son fake-UTC**:
- Los Excel tienen horas locales sin timezone info
- El parser genera `"YYYY-MM-DDTHH:MM:SS.000Z"` → el sufijo Z es un artefacto, son horas locales
- Regla de oro: para display usar `timeZone: 'UTC'`, para segmentación usar `getUTCHours()` / `getUTCMinutes()`

**`normalizeShiftLabel` está exportado pero ya no se usa en segmenter** (solo legacy doc comment en graderShiftSchedule.ts). Se mantiene export por si se quiere habilitar análisis por equipo A/B después.

**Excel files de la temporada completa** están en:
```
C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026/
  pieza a pieza/{mes}/*.xlsx   — 30 archivos PP
  punto 0/{mes}/*.xlsx         — 8 archivos P0 mensuales + 1 consolidado jul-feb (se descarta)
```
Si se necesita re-procesar o corregir algo, usar `scripts/iter18-full-season-rebuild.js` (ya tiene el parser, segmenter y computeSummary portados a plain JS).

**⚠️ TRAMPA — archivos Excel consolidados del Marelec**: el Marelec exporta un archivo "consolidado" que cubre toda la temporada (ej. `(20250701_000000 - 20260228_000000).xlsx`). Ese archivo **solapa 100% con los mensuales** → si se leen ambos, se cuenta cada pieza 2×. `scripts/reclassify-from-excel.js` y cualquier parser batch debe filtrar archivos con rango >40 días vía `isConsolidatedFile()`. Además deduplicar por `dedupeKey = ts|gate|pieces|weight|error|calibre|quality` para casos de solapamiento residual (noviembre 2025 tiene solapes de 5 días entre archivos semanales).

## Cambios recientes (sesion 2026-04-11 tarde — Grader iter 7: carga masiva histórica + calendario, v2.75.0)

### Grader iter 7 — Historial de producción persistente en calendario

**Objetivo**: Construir un archivo histórico de datos Grader subiendo los Excel exportados de Matrix (uno a uno o en batch). Cada archivo se distribuye por día+turno y queda guardado en Firestore. El calendario muestra cada día con sus KPIs y badges "Falta PP"/"Falta P0".

**Archivos nuevos:**
- `AnalisisGraderCargaMasivaPage.tsx` — página dedicada para subir múltiples archivos Excel históricos a la vez. Preview de segmentos antes de guardar. Navega al calendario tras guardar.
- `graderSegmenter.ts` (nuevo) — `segmentByDayAndShift()` + `computeShiftSummary()` + `sortedSegmentEntries()`. Agrupa registros por {sessionDate × shiftId}, maneja turno noche que cruza medianoche.

**Archivos modificados:**
- `AnalisisGraderCalendarPage.tsx` — accept `?goto=YYYY-MM-DD` param para navegar directo al mes correcto; auto-discovery de datos en últimos 12 meses; badges "Falta PP"/"Falta P0" en celdas del calendario (solo cuando falta algo); panel derecho por turno con "Falta PIEZA_PIEZA"/"Falta PUERTA_0"
- `AnalisisGraderWizardPage.tsx` — banner azul automático cuando archivo cubre > 1 día. Botón "Guardar en Calendario" que segmenta y guarda directamente. También funciona para archivos P0-puros.
- `graderDailySummary.service.ts` — `saveDailySummaryBatch` ahora usa merge inteligente: upload P0-solo (hasPieceData: false) hace `{ merge: true }` en Firestore → preserva KPIs del PP existente. Upload PP hace overwrite completo.
- `graderExcelParser.ts` — función `pushAll()` helper que reemplaza `push(...largeArray)`. Fix crítico: `push(...)` con 200k+ elementos desborda el call stack de V8.
- `types.ts` — `GraderDailySummary` tiene `hasPieceData?: boolean` y `hasGate0Data?: boolean`

**Flujo de carga incremental que funciona:**
1. Subir archivo PP multi-día → banner "Guardar en Calendario" → días poblados con "Falta P0"
2. Subir archivo P0 multi-día → banner "Archivo P0 multi-día — actualizará causas P0 sin borrar datos PP" → merge, badges desaparecen
3. Pinchar en un día del calendario → panel derecho muestra KPIs del turno

**Gotchas críticos de esta sesión:**

**`push(...largeArray)` — stack overflow con 200k+ registros:**
- V8 expande los elementos como argumentos de función. Límite efectivo ~65k argumentos.
- Con 206k registros de PUERTA_0: "Maximum call stack size exceeded"
- Fix: `pushAll(target, source)` que hace loop `for (let i = 0; i < source.length; i++) target.push(source[i]!)`
- También aplica a `[...a, ...b]` para arrays gigantes → usar `.concat()`
- Afectaba: `graderExcelParser.ts` (4 lugares) + `CargaMasivaPage.tsx` (2 lugares) + `graderSegmenter.ts` (1 spread)

**`react-hooks/rules-of-hooks` es ERROR, no warning — bloquea CI:**
- `if (!canSee('X')) return <Navigate />` antes de `useCallback` hooks → ESLint error level → CI falla aunque no llegue al límite de 10 warnings
- Fix: mover TODOS los hooks antes de cualquier return condicional

**`sync:version` prebuild script:**
- El script lee `apps/pwa/package.json` y escribe `version.ts`. Si bumpeás `version.ts` sin bumpar `package.json`, el siguiente build lo revierte.
- Fix: siempre bumpar AMBOS archivos o solo `package.json` (el script lo propaga)

**PWA chunk loading error después de deploy:**
- "Failed to fetch dynamically imported module: .../AnalisisGraderCalendarPage-B42qwyE-.js"
- Causa: browser cargó la app con el service worker viejo, luego intentó importar un chunk con hash nuevo
- Fix del usuario: clic en "Recargar página". Los datos SÍ se guardaron correctamente.
- Los datos se guardan ANTES de la navegación al calendario, así que el error no borra nada.

**`useState(() => { sideEffect() })` es bug:**
- Usar `useState` como contenedor de side effects es incorrecto y viola las reglas de React
- Fix: usar `useEffect(() => { sideEffect() }, [])`

## Cambios recientes (sesion 2026-04-11 — Grader iter 6: config física real + insights físicos, v2.74.0)

### Grader iter 6 — Calibración física real de la Marelec MS4/12

**Datos reales capturados en planta** (foto pantalla Z2):
- `z2ProgrammedDistancesMm`: `[1250, 2200, 3800, 5200, 6550, 7850, 9150, 10400, 11700, 13175, 14800, 15850]` — valores individuales por flipper, no pitch uniforme
- Velocidades cintas (factor k = 0.000786 m/s/unidad, anchor: 1781 unidades = 1.4 m/s spec):
  - Z-Belt: 494 unidades → 0.39 m/s
  - Accel1: 1313 → 1.03 m/s (largo físico medido: 3.65 m)
  - Accel2: 1560 → 1.23 m/s (largo físico medido: 1.70 m)
  - Sorting Belt: 1631 → 1.28 m/s (el KPI principal de velocidad)
- Gate 1 a 1300mm del sensor, pitch nominal 1370mm entre pivots, paleta 475mm
- Offset de Z2 vs físico: varía por flipper, rango -50mm (gate 1) a -560mm (gate 9)

**Causas reales P0 desde pantalla "Resultados Clasificación" Z2:**
- `fuera_limites`: "Fuera de límites"
- `fotocelula`: "No leído por fotocélula"
- `too_close`: "Too close or too long"
- `puerta_no_preparada`: "Puerta no preparada"

**Nuevas features implementadas (`feat(grader): iter 6`):**
- `GraderResumenRapido.tsx` — Resumen Ejecutivo al cargar Excel: P0% en grande con color, KPIs, causas P0, top 3 problemas, top 3 acciones, widget inline velocidad Sorting Belt (editable 0.5–1.4 m/s)
- `analyticsResult` centralizado en `WizardPage` → `alertInsights` deriva del mismo resultado (evita doble cómputo)
- `physicalConfig` se carga de Firestore al montar (`getModuleRanges()`) para que esté disponible antes de que el usuario abra Gates Config
- `handleGatesApply` sincroniza `sortingBeltMps` del config guardado
- `dashboardRef` + scroll button en ResumenRapido para bajar al dashboard completo

**Insight #17 — Gate sobrecargada** (`graderInsights.ts`):
- Usa `result.gateAdvancedStats` (no `gateBalance` que no tiene `gateNumber`/`pieces`)
- Si 1 gate > 35% del tráfico → warn; > 50% → critical
- Sugiere duplicar calibre en gate con baja carga (< 45% del promedio)

**Insight #18 — Timing Z2 entre gates adyacentes**:
- Compara tiempo disponible `(dis_n+1 - dis_n) / vel_sorting` vs tiempo requerido `(largo_salmón / vel) + 0.45s (reset neumático)`
- Solo checks gates ADYACENTES (consecutivas en número, ej: gate 3 y 4)
- Si margen < 150ms → insight warn/info con referencia a causa "puerta no preparada"

**Tabla velocidades Z2** en `AnalisisGraderGatesConfigPage.tsx`:
- Muestra unidades Z2 raw + m/s calculados con factor k = 0.000786
- TypeScript fix: declarar `type SpeedKey = 'zBeltUnits' | 'accel1Units' | 'accel2Units' | 'sortingUnits'` (evita `keyof typeof readings` = `never` cuando `readings` = `{}`)

**Deploy v2.74.0** (commits principales):
- `feat(grader)`: iter 6 completo
- `fix(version)`: merge conflict → daily-sync bot había revertido 2.74.0 → 2.73.0 en main; fixed con commit explícito
- `fix(grader)`: `noUncheckedIndexedAccess` errors en insights #17 y #18 (`32710b2`)

### Gotchas nuevos de esta sesión

**`noUncheckedIndexedAccess: true` en tsconfig — patterns seguros:**
- `array[i]` devuelve `T | undefined` aunque el loop tenga `i < array.length - 1`
- Fix: usar `array[i]!` cuando el loop garantiza existencia
- Fix: no usar `underloaded.length > 0 ? underloaded[0].x` — TypeScript no narrowea el elemento. Guardar `const el = underloaded[0]` y usar `el !== undefined ? el.x`
- `keyof typeof obj` = `never` cuando `obj` puede ser `{}` (undefined coalesced). Usar un tipo explícito en su lugar.

**Merge conflict con daily-sync bot:**
- El bot de daily-sync hizo commit en main cambiando version.ts 2.74.0 → 2.73.0
- Al hacer `git merge feature-branch`, la 3-way merge mantuvo el cambio del bot
- Fix: después del merge, commitear explícitamente la versión correcta
- Prevención: bumpar version SOLO en el commit final antes del push a main

**Factor de conversión velocidad Z2:**
- Unidades Z2 del controlador Marelec → m/s: factor k = 0.000786 m/s/unidad
- Derivado anclando: 1781 unidades (max del campo "Sorting Belt") = 1.4 m/s (spec máxima MS4/12)
- Mismo factor aplica a todas las cintas (verificado: ratio unidades/spec consistente en las 4 cintas)

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

## Módulo Visor Planta 3D — Estilo y Tecnología

### Ruta
`/mantenimiento-planta/map/planta` → `MapaPlantaPage.tsx` → `PlantaScene3D.tsx`

### Estilo visual objetivo (OBLIGATORIO respetarlo)
El módulo debe replicar fielmente el estilo de las **infografías isométricas medievales virales de Instagram** (ej. ciudades árabes/europeas medievales en tonos cálidos con anotaciones en pergamino, cielo golden hour, sombras largas, vista 3/4 aérea). Características clave:

- **Vista aérea isométrica** — cámara alta, ángulo ~35–45° respecto al suelo, sin perspectiva extrema
- **Iluminación golden hour** — sol bajo en el horizonte (~15–20° sobre él), color naranja-ámbar intenso, sombras largas y cálidas, relleno azul-violeta del lado opuesto
- **Paleta tierra cálida** — suelos en ocres/marrones, paredes en arena/arcilla, techos en tonos óxido/terracota/pizarra
- **Anotaciones tipo pergamino** — etiquetas con fondo sepia, borde dorado, texto serif, línea de conexión al edificio
- **Tarjetas de estadísticas estilo medieval** — esquinas redondeadas, fondo oscuro con borde dorado, texto serif en dorado/crema
- **Edificios con carácter** — variación de alturas pronunciada, elementos decorativos (ventanas, rayas de categoría), techo a dos aguas si es posible

### Stack técnico disponible (ya instalado en apps/pwa/package.json)
- `@react-three/fiber` 8.17.10 + `@react-three/drei` 9.117.3 — Canvas, OrbitControls, Sky, Environment, Html, Line, ContactShadows
- `three` r182 — geometrías, materiales, texturas canvas procedurales
- `zustand` 5.0.2 — store `usePlanta3DStore`

### Paquetes adicionales a considerar para fases futuras (instalar cuando se necesiten)
- `@react-three/postprocessing` — Bloom, SSAO, Vignette, ChromaticAberration (iluminación cinematográfica)
- `three-stdlib` — helpers adicionales de three.js
- `maath` (ya incluida con drei) — funciones matemáticas para animaciones
- `leva` — panel de control de parámetros en dev (debug de luces/cámara sin editar código)

### Archivos del módulo
```
apps/pwa/src/
  pages/MapaPlantaPage.tsx          — página principal (header + canvas + overlays)
  components/map/3d/
    PlantaScene3D.tsx               — Canvas R3F, cámara, luces, Sky, OrbitControls
    Building3D.tsx                  — edificios clicables con label, status ring, overlay
    Silo3D.tsx                      — silos/estanques cilíndricos con label
    Ground3D.tsx                    — suelo procedural, muros perimetrales, torres
    InfoPanel3D.tsx                 — panel deslizante derecho con detalles de zona
    StatsCards.tsx                  — tarjetas absolutas top-left y top-right
  data/zonas3d.ts                   — ZONAS[], SILOS[], MOCK_OT, constantes de color
  store/usePlanta3DStore.ts         — estado global (selectedZona, toggles)
```

### Configuración de cámara de referencia
```tsx
camera={{ position: [65, 58, 65], fov: 45 }}  // vista aérea isométrica golden hour
<OrbitControls maxPolarAngle={Math.PI / 2.25} minDistance={12} maxDistance={130} target={[0,2,0]} />
```

### Planos reales disponibles (PRÓXIMA PRIORIDAD)
Ruta: `C:\Users\pc hp\OneDrive\ANTARFOOD\Mapas\`

Archivos disponibles:
- `planta principal.dwg` — AutoCAD de la nave de proceso (cotas en metros)
- `planta principal.png` — imagen del plano arquitectónico (ya copiada a `public/maps/planta-principal.png`)
- `recinto completo.dwg` — AutoCAD del predio completo
- `recinto completo.png` — imagen del predio (ya copiada a `public/maps/recinto-completo.png`)
- `mapa planta principal.pdf` — PDF de la planta
- `vistas aereas varios años/` — carpeta con fotos aéreas históricas
- `coordenadas gps 4 puntos del recinto completo/` — 4 capturas Google Earth con GPS de esquinas

**GPS de las 4 esquinas del recinto:**
| Punto | Latitud | Longitud | Elevación | Descripción |
|-------|---------|----------|-----------|-------------|
| A | 42°33'54.98"S | 73°40'47.68"W | ~49 m | Tierra — planta principal |
| B | 42°37'41.07"S | 73°42'22.53"W | 0 m | Mar — jaulas acuicultura |
| C | 42°37'41.61"S | 73°40'23.16"W | 0 m | Mar — jaulas acuicultura |
| D | 42°38'00.20"S | 73°40'43.46"W | ~55 m | Tierra — recinto |

Con Haversine A→D = dimensión real del recinto en metros. El DWG ya tiene cotas internas en metros.

**Flujo DXF para 3D preciso:**
1. En AutoCAD: `Archivo → Guardar como → DXF` (guarda `planta principal.dxf`)
2. `pnpm add dxf-parser` → parsea coordenadas reales de cada muro/sala
3. Script: DXF coords → normalizar a world units → reconstruir `zonas3d.ts` con posiciones/tamaños reales
4. 1 unidad world = 1 metro real

**Estado actual:** `planta-principal.png` ya está como textura translúcida en el suelo 3D (Ground3D.tsx, opacidad 0.35) como guía visual mientras se espera el DXF.

### Fases de desarrollo
- **Fase 1 (MVP)** ✅ — 12 edificios procedurales, 3 silos, suelo, muros, StatsCards, InfoPanel, labels pergamino, cámara ortográfica, toon shading, bloom, vignette
- **Fase 1.5** ✅ — Techos piramidales, paleta medieval cálida, adoquines, chimeneas, niebla atmosférica
- **Fase 2 (PLANOS)** — Incorporar planos DWG reales: textura de suelo con imagen del plano + reposicionar edificios con coordenadas reales
- **Fase 3** — Toolbar vertical flotante, flechas de flujo animadas, tween de cámara al seleccionar edificio, marcadores IoT
- **Fase 4** — three-dxf parser completo, modelos .glb con Draco, optimización mobile

---

## Pendientes priorizados

### PENDIENTE — Análisis de Turno (actualizado sesión 2026-04-26)

**Auditoría módulo completa (sesiones 2026-04-25/26):**
- ✅ `ShiftTimelineView` 2ª pasada — coverage badge accionable, checkpoint zoom ±5min, P0 delta entre uploads
- ✅ `CurrentGateConfigPanel` — distribución calidades + badge cambios mid-turno
- ✅ `MinuteDetailDialog` — calibre dominante + banner sin-rechazos
- ✅ `PauseAnnotationDialog` — hint teclado numérico + label Cerrar/Cancelar
- ✅ `graderP0Thresholds.ts` — fuente única real: todos los `3.5`/`2` hardcoded eliminados en 10+ archivos
- ✅ `?turno=X` en `GraderQuickChangePage` — banner RETROACTIVO para registro retroactivo
- ✅ `summarizeByCategory` audit — sin violaciones encontradas
- ✅ 9 warnings ESLint + cap bajado a 5

**P1 — Estructural (requiere planeación Opus):**
- 🔲 **Refactor config Grader Fase A** — mover 12 Gates + Física al turno (`AnalisisGraderTurnoPage`), botón "Cambié gate" mid-turno + segmentación automática. **Requiere refactor storage Firestore.** (1-2 días, NECESITA OPUS)
- ✅ **GlobalSettingsModal en home** — move estructural completado 2026-04-26: rangos de GatesConfigPage ahora read-only, botón abre GlobalSettingsModal con reload al cerrar

**P2 — Mejoras chicas:**
- 🔲 **Fase 3b — Edición manual de rangos de pausas** — drag handles en bandas Timeline (~2-3 días)
- 🔲 **Fase 4 — CRUD admin de tags** — gestión Firestore de `graderPauseTags` (~2-3 días)
- ✅ **pieceRecords productivas** — 383 turnos × 5.37M records ya en Firestore (verificado dry-run 2026-04-26: 0 nuevos en todos los segmentos)

---

### PENDIENTE — Shoplogix Integration (actualizado sesión 2026-04-26)

**Estado completo — Fases 1–3 + extras terminados:**
- ✅ Fase 1 POC + Fase 2a UI + Fase 2b Cloud Functions + Fase 2b.1 ROPC UI
- ✅ Data real Feb 25-27: 5 turnos OK, 3 Evisceradoras
- ✅ Fases 3 iter 1-4: ticks, correlación, scatter P0%↔Baader, PDF upstream
- ✅ Marcadores Baader en chart ECharts del Grader (markArea translúcidas)
- ✅ Drill-down rich al clickear segmentos Gantt
- ✅ Synchronized Timeline F1-F5 (mini-KPIs zoom, badge coincidentes, PNG export, lot projection)
- ✅ Alineación temporal real + fix-on-read + planned downtime excluido
- ✅ Admin hub `/admin` con gestión creds Shoplogix

**Hallazgos técnicos críticos (NO cambiar sin leer):**
- Shoplogix guarda wall-clock LOCAL Chile as-if-UTC → `getUTCHours()`, NO convertir TZ
- `summary.currentShiftStart/End` opaco → pasar `shiftStartAt/EndAt` explícitos siempre
- `actualRuntime` Shoplogix opaco → usar `uptime/totalTrackedSec` propio
- Post-shift marcado como `break/planned downtime` → `isPlannedDT()` lo excluye del runtime

**Deuda activa:**
- 🟡 **ROPC `invalid_client`**: `client_id=SAAS139` no acepta `grant_type=password`. Sistema opera con cookie fallback (`SHOPLOGIX_COOKIE` en GCP). Cuando expire: rotar en GCP secret o capturar OAuth real. UI: `/admin/shoplogix-credentials`.
- 🔲 Fase 4: integrar Marel HG, Knuro, plantas hermanas (bloqueado API externa)

---

### PENDIENTE — Visor Mapas Konva (actualizado sesión 2026-04-26)

**Estado:**
- ✅ Stack Konva + DXF parser + bbox robusto + Fase 2 edición (select/move/delete/undo)
- ✅ Panel capas + toggle + eliminar
- ✅ **sceneFunc optimizer** — 1 Shape por capa (50-100× speedup en capas pesadas)
- ✅ Texto libre + Alinear grilla + Equipos SAP (vistas Leaflet)
- ⚠️ `mapasImportados` NO persisten — localStorage quota insuficiente

**Pendiente:**
- 🔲 **Custom hit-detection** en sceneFunc para selección por entidad individual
- 🔲 **IndexedDB** para persistir mapasImportados (localStorage ~5MB insuficiente)
- 🔲 Fase 3: drawing tools (Línea, Polígono, Círculo, Rectángulo)
- 🔲 Conectar toolbar existente (Medir, Grilla, 3D, Niveles) al KonvaDxfViewer
- 🔲 Equipos SAP/Repuestos sobre DXF Konva (posicionar, drag&drop, click → datos SAP)

---

### PENDIENTE — Visor Mapas 3 (sesión 2026-04-22) [legacy, Leaflet views]

**Módulo:** `/mantenimiento-planta/map` — Leaflet CRS.Simple + SVG DXF + Geoman + Zustand (vistas Recinto/Planta)

**Estado:**
- ✅ Grilla 1m×1m anclada a DXF (fase invariante a zoom/pan via `gridPhase()`)
- ✅ Ángulo de grilla por vista (recinto/interior independientes)
- ✅ Dibujar polilíneas/paredes (Geoman `drawPolyline`)
- ✅ Header móvil responsive
- ✅ Absorber capas DXF como CapaUsuario (sesión 2026-04-23)

**P1 Visor Mapas (no migradas a Konva aún):**
- 🔲 Equipos del módulo Repuestos sobre el mapa (posicionar motores/bombas, drag&drop, click → datos SAP)
- 🔲 Firestore sync (esquema `/maps/{view}/elementos/{id}`, reglas admin-only-write)
- 🔲 Texto libre / anotaciones (`drawText: true` en Geoman)
- 🔲 Alinear grilla a muro (click 2 puntos → detectar ángulo)

---

### PENDIENTE — Grader iter 10 (sesión 2026-04-21)

**Quick wins completados en iter 10:**
- ✅ **#5 QuickGateChangeButton deshabilitado en turno cerrado** (v2.147.0) — `allowEdit` prop cascada TurnoPage→ConfigChangeHistory→QuickGateChangeButton. Tooltip explica motivo.
- ✅ **#4 Badge 🔧 en calendario histórico** (v2.148.0) — lazy-load count de snapshots manuales al seleccionar un día. Badge amber con icono Wrench + tooltip en la tarjeta de turno.

**P1 — Alta prioridad**

- 🔲 **Refactor config Grader — Fase A** — mover las 12 Gates + configuración Física al acordeón del detalle de turno (`AnalisisGraderTurnoPage`), en lugar de vivir solo en la página de config global. Botón "Cambié gate" mid-turno + segmentación automática antes/después del cambio. Plan de 3 fases acordado sesión 2026-04-19. Es el pendiente estructural más importante.
- ✅ **#1 GlobalSettingsModal en home** — COMPLETADO 2026-04-26: move estructural rangos GatesConfigPage → GlobalSettingsModal. Tab rangos ahora read-only + botón "Editar rangos en configuración global" que abre modal con reload de Firestore al cerrar.

**P2 — Media prioridad**

- ✅ **#6 Tests `computeSegmentVerdicts`** — DONE 2026-04-25 v3.0.3. Cubierto con 29 tests (entradas vacías, synthetic, insufficient-data, improved/worsened/neutral, afterMinutes, múltiples snapshots con boundeo, boundaries finos +0.5/=0.5, snapshot al final). Constantes `MIN_PIECES_AFTER_THRESHOLD` y `DELTA_THRESHOLD_PTS` exportadas para consistencia.
- 🔲 **#2 Ruta mobile `/grader/quick-change?turno=X`** — vista reducida para supervisor con celular. (~1h)
- 🔲 **Fase 3b — Edición manual de rangos de pausas** — drag handles en bandas del Timeline para redimensionar/crear/descartar pausas. Estado local complejo + persistir a Firestore + no pisar el detector automático. `ShiftTimelineView.tsx`. (~2-3 días)
- 🔲 **Fase 4 — CRUD admin de tags** — página admin para gestionar `graderPauseTags` en Firestore (crear/renombrar/cambiar color+emoji/archivar). Hoy los 9 tags están hardcoded en `graderPauseTags.ts`. Reglas Firestore nuevas. (~2-3 días)
- ✅ **pieceRecords productivas** — 383/383 turnos ya en Firestore (5.37M records, verificado 2026-04-26)

---

### P1.12 — ✅ COMPLETADO sesión 2026-04-21 (Análisis Grader iter 9, v2.134.0→v2.143.0)

- ✅ **v2.134.0** — Export PNG + Export CSV + Selector rango (`Todo / 1h / 10min`) en `ShiftTimelineView`. PNG: `getDataURL(pixelRatio:2)` con renderer canvas. CSV: fila por minuto con BOM UTF-8 para Excel, excluyendo minutos pre/post-turno. Rango: `dataZoom.start/end` proporcional al `totalMinutes` real.
- ✅ **v2.135.0** — `GateBreakdownCard`: card analítico nuevo entre Timeline y configuraciones en `AnalisisGraderTurnoPage`. Muestra distribución de piezas y tiempo muerto por gate con barras horizontales, P0% per-gate, std-dev. Agrega `useGraderShiftAnalytics` existente.
- ✅ **v2.141.0** — `PauseKpiDashboard`: 4 KPI cards (total muerto, pausas ≥5min, promedio turno, % muerto) + barchart CSS por día (agrupado por semana si >60 días). Integrado en `AnalisisGraderPeriodoPage` usando `allSummaries` ya cargados (0 queries extra).
- ✅ **v2.142.0** — Desglose por tag en `PauseKpiDashboard`: lazy-load de `meta/pauses` en batches de 15, barra de progreso, `TagBreakdownChart` con barras de colores por categoría + porcentaje. Auto-reset al cambiar período.
- ✅ **v2.143.0** — Panel anotación batch en `PauseKpiDashboard`: visible solo para admins cuando hay pausas sin clasificar. Selector inline + botón OK por pausa. Optimistic update de `tagBreakdown` al guardar (resta de `__sin_tag`, suma al bucket elegido).

### P0 — ✅ COMPLETADO sesión 2026-04-19 (v2.132.0 — enrichment full columns)
- ✅ **Script reclassify amplio**: parser extrae Lote + Conservación + Producto + Turno A/B (además de Calidad + Calibre ya existentes)
- ✅ **`computeEnrichment()`** agrega por minuto (`bucketExtrasByMinute`) y por turno (`lotsInShift`, `calidadBreakdown`, `productoBreakdown`, `conservacionBreakdown`)
- ✅ **Reprocesamiento 383 turnos** — 0 errores en 11.3 min (updates individuales secuenciales — batch hacía DEADLINE_EXCEEDED con bucketExtrasByMinute grande)
- ✅ **Timeline**: tiempos muertos 2 tiers (Pausa naranja 8-30min + Colación azul >30min, ejercicios 3-8min ocultos por ser ruido)
- ✅ **Timeline**: markLine 📦 morado en cambios de lote dominante entre minutos consecutivos
- ✅ **Tooltip timeline** enriquecido con 📦 Lote + 📏 Calibre del bucket
- ✅ **`ShiftBreakdownsCard.tsx`** (nuevo): card con 4 columnas Lotes/Calidad/Producto/Conservación, backward compat (null si data vacía)
- ✅ **Badge Turno A/B** en header del turno (rotación día/noche inferida por mayoría en columna Turno del Excel)

### P0 — ✅ COMPLETADO iter 19 (Grader PeriodView)
- ✅ **Drill-down hourly**: `hourlyFiltered` + `hourlyChartData` cuando zoom ≤ 2 días (GraderPeriodView L149-296). Implementado en iter 18.1.
- ✅ **KPIs dinámicos según zoom**: `visibleStats` recalculado via `computeStatsFromSummaries(visibleSummaries)` (L130-142). KPI cards usan `visibleStats`.
- ✅ **Selectores semana/mes**: `getWeekRangeByOffset`/`getMonthRangeByOffset` + botones prev/next en AnalisisGraderPeriodoPage (L127-139, L252-290).

### P0.5 — Grader iter 19 (modelo neumático + umbrales) — sesión 2026-04-13
- ✅ **Validar flujo PP→P0 incremental** end-to-end con Excel reales julio 2025 (5 tests integración: parse PP, parse P0, merge sin duplicar, inferencia sin P0, totales consistentes)
- ✅ **Asignación óptima de calibres a gates**: `computeOptimalGateAssignment` en graderGateTiming.ts — heurística greedy timing×demanda
- ✅ **Semáforo tiempo de reacción por gate**: modelo neumático per-gate Darcy-Weisbach (`computeGateTimingSignals` + `PneumaticBreakdown`), columnas Válv/Línea/Cil ms + P_eff en CompuertasTab, sección "Configuración Neumática" en GatesConfigPage con preview en vivo
- ✅ **Ajustar umbrales** insight #17/#18: `gateOverloadWarnPct/CriticalPct`, `timingMarginOkSec/WarnSec` configurables vía errorThresholds + card inline en CompuertasTab. 18 tooltips neumáticos nuevos.

### P1.8 — Refactor Grader
- ✅ Partir `GraderTendenciaTab` (1053 → 191 líneas) en 6 sub-cards bajo `tabs/tendencia/` (iter 19, pre-sesión)
- ✅ Partir `GraderPuntoCeroTab` (1157 → ~80 líneas) en 5 sub-cards bajo `tabs/puntocero/` (sesión 2026-04-13)
- ✅ Unit tests de `graderGateTiming` (32 tests vitest — física neumática + semáforo). Setup vitest + happy-dom.
- ✅ Unit tests de `useGraderDashboardAnalytics` (13 tests: forecast, progress, degradation, multiSession, shiftComparison)
- ✅ Unit tests de `useGraderPatternAnalytics` (13 tests: filtros causa/tiempo, aggregados, chartData, causeTrend)

### P0.6 — Timeline segundo a segundo (sesión 2026-04-14)
- ✅ **TendenciaTimelineCard**: card colapsable con GraderTimelineChart en tab Tendencia del dashboard
- ✅ **Bulk upload 5.37M pieceRecords** → Firestore (383 segmentos, julio 2025–feb 2026, script idempotente con retry)
- ✅ **25 rondas UX** del timeline:
  - R1-R5: ejes separados, tooltip enriquecido, leyenda, scatter opacity, header badges
  - R6-R10: producción dual grid, moving avg dorado, bandas calibre, gaps ☕, zoom stats
  - R11-R15: crosshair, dark theme polish, errores markLine, labels pausas
  - R16-R20: P0% clamp 100%, labels calibre en bandas, glow shadow, producción line+area
  - R21-R25: P0% acumulado + target 2%, gates stacked area (5ta capa), leyenda completa
- ✅ **5 capas toggleables**: Pesos(g), P0%(5min), Errores P0, Pzas/min, Gates
- ✅ **Fallback weightKg→weightPerPieceGrams** cuando falta columna "peso en Gr" en Excel
- ✅ **Agregar campo `lot` al script bulk upload** — implementado + backfill 383 summaries con `meta/timeline` (sesión 2026-04-15)
- ✅ **Timeline aggregates pre-computados** (`meta/timeline` sub-colección) — carga automática sin botón, Firestore rules fix

### P1.9 — Grader Producto UX + Sugerencias IA trazables (sesión 2026-04-17, commit 5375a412)
- ✅ **FASE 1**: Tab Producto rediseñado en 3 capas (Hero + ⚙️ Equipo flipper colapsable + 📐 Diagnóstico técnico colapsable)
- ✅ **FASE 2**: 10 nuevos campos GraderPhysicalConfig (timing flippers, gates, maxBinWeight). Sub-card A editable con inputs reales.
- ✅ **FASE 3**: Motor IA sugerencias (5 generadores + SuggestionCard + SuggestionsPanel + useSuggestionEngine)

**✅ FASE 4 — Modelo multi-cinta (verificado en sesión 2026-04-18)**
- ✅ Grading belt / z-belt / acceleration 1 / acceleration 2 independientes en `GraderBeltConfig` con `BELT_FLOW_ORDER` en `graderBeltHelpers.ts`
- ✅ Tab Cintas con `CintasTab.tsx` + selector por nombre + parámetros individuales
- ✅ Ratios calculados por cinta correspondiente (grading = 0.70 m/s, z-belt = 0.42 m/s)

**✅ FASE 5 — Modales de medición (verificado en sesión 2026-04-18)**
- ✅ `SlowMoMeasurementModal.tsx`: guía paso-a-paso + SVG iPhone 240fps + frames/240=s → Firestore `flipperTimingMeasurements`
- ✅ `TachMeasurementModal.tsx`: guía tacómetro SKF con SVG vista lateral, DOs/DON'Ts, 3 zonas, promedio → Firestore `beltSpeedMeasurements`
- ✅ Badge "Medido el DD/MM" + botón "Re-medir" integrado en sub-cards de Equipo flipper

**✅ FASE 6 — Audit trail configuración (verificado en sesión 2026-04-18)**
- ✅ Colección Firestore `graderConfigChangeLog` + regla en `firestore.rules`
- ✅ Hook `useConfigChangeLogger` que wrappea `setPhysicalConfig` y registra cambios automáticamente
- ✅ Vista mini "Historial de cambios" en tab Producto (últimos 10 cambios con quién/cuándo/qué)

### P1.10 — Cronometrar reset flipper (investigado 2026-04-17 con docs internos Z2)
**Modelo real**: Marelec **MS4/12** (estático + z-conveyor + 2 cintas aceleración + grading belt de 12 salidas). El "Z2" es el NOMBRE DEL COMPUTADOR/HMI, no del grader.
**Specs**: belt max 1.4 m/s · producto max 1100×290 mm · peso 0-15 kg · precisión ±20g (0-5kg), ±50g (5-15kg) · aire min 600 L @ 0.7 MPa (7 bar).
**Distribuidor**: Marelec Chile Ltda. · Avenida Austral 1746 · Jardín Oriente · Puerto Montt · tel +32 58 222 111 · support@marelec.com.

**Hallazgo clave — reset flipper NO es parámetro software**:
Cada cilindro neumático tiene **válvula con regulador de flujo mecánico**. La velocidad se ajusta **físicamente con un tornillo** (CCW aumenta velocidad, CW reduce). Solo se ajusta el **flujo de escape**, no el de fuerza. Meta: "abrir/cerrar rápido sin ruido vibrante". Esto explica el amber "Estimado" — el valor deriva mecánicamente con el tiempo.

**Acceso a menú servicio del Z2**:
- Password documentada: **8620** (Menú principal → Servicio → Cambiar parámetros → [8620])
- Confirmada en instructivo CH-MT-ME-0002 (validado 24.10.2024)
- Menús visibles en el PDF interno de 418 páginas:
  - Velocidades de cintas
  - Mostrar resultados de clasificación
  - Probar entradas / Probar salidas (activa flippers uno por uno — útil para cronometrar)
  - Monitor CPU
  - **Explorar CAN bus** (actuadores conectados por CAN — potencial de leer timing si hay log)
  - Localizar IDs aleatorias (CAN devices)
- Calibración báscula: `>0<` para tarar + peso patrón + parámetro `fsWc` (1 pocket × 10-15 min)

**Plan de medición (prioridad)**:
1. Usar "Probar salidas" del menú Servicio → activa flipper aislado → slow-mo 240fps iPhone → contar frames desde inicio movimiento hasta detención completa → `frames / 240 = segundos`
2. Si el CAN bus expone timing en "Explorar canbus" → capturar trama + timestamps (requiere adaptador CAN-USB, nice-to-have)
3. Registrar en UI con: método usado, timestamp, presión aire al momento, usuario

**Archivos docs internos (OneDrive `⚙️ GRADER/`)**:
- `instruction manual Grader.pdf` — manual oficial MS4/12, 59 pág (texto extraíble)
- `parametros grader.pdf` — 418 pág **screenshots HMI** menú servicio (no extraíble con pdftoppm, revisar manual)
- `parametros grader.docx` — versión Word (8 MB, pendiente parsear)
- `CH-MT-ME-0002 Instructivo Calibración Grader.pdf` — 2 pág flujo calibración con clave 8620
- `Basculas Grader.pdf/docx` — info pesaje
- Carpeta `temporada 2025-2026/` — Excel PP y P0 (ya migrados a Firestore)

**PARÁMETROS Z2 REALES extraídos 2026-04-17 (DOCX `parametros grader.docx`)**:

Flipper timing (¡todo configurable por software en el Z2!):
- `delayFlipperOpen = 150 ms` — ms delay to open flipper before product
- `delayFlipperClose = 150 ms` — ms delay to close flipper after product
- `minFlipperOpenTime = 350 ms` — ms, minimum open flipper time for product
- `fixedOpenFlipper = 0`, `triggerPointFlipper = 0`

Dinámica cinta:
- `minSpeed = 50 mm/s`, **`maxSpeed = 700 mm/s` (= 0.70 m/s — NO 1.28 m/s como asume nuestra app)**
- `acceleration/deceleration = 100 mm/s²`
- `numGates = 12`, `posGate1 = 2`

Eye sync (detección):
- `disEyeSync = 425 mm` (distancia desde inicio cinta al ojo sync)
- `inpEyeSync = 3`, `eyeSyncMinLength = 10`, `eyeSyncMaxDender = 400`, `maxDif = 1800`

Identificación:
- `sernr = 3943` (coincide con manual, fabricación sept 2012)
- **IP red: 172.27.12.12** modo "RC = Remote Connection" (potencial de integración futura)
- Runtime: 5825 horas acumuladas (a la fecha del screenshot)

**Implicaciones para la app**:
1. El "Reset flipper 0.45s" de la app NO es estimado — es interpretación ambigua. Posibles equivalencias:
   - minFlipperOpenTime = 350 ms = 0.35 s (tiempo mínimo abierto)
   - Ciclo total software = 150+350+150 = 650 ms = 0.65 s
   - Reset mecánico puro del cilindro (tornillo flow regulator) — solo por slow-mo
   - **Pendiente: decidir con el usuario qué semántica usar y renombrar el campo**
2. Velocidad cinta configurada 0.70 m/s, NO 1.28 m/s — ajustar cálculos en tab Producto/Cintas
3. Agregar en app inputs explícitos para `delayFlipperOpen/Close` (nuevos) + `minFlipperOpenTime` (renombrar "Reset flipper")

**✅ Implementación P1.10 completada (sesión 2026-04-18)**:
- ✅ Renombrado campo "Reset flipper" → `minFlipperOpenTime` con tooltip Z2 (v2.128.0)
- ✅ Inputs `delayFlipperOpen`/`delayFlipperClose` (150 ms default) en Sub-card A de ProductoTab
- ✅ `maxSpeed` cinta = 0.70 m/s en GraderPhysicalConfig
- ✅ `Z2CaptureModal.tsx` — modal completo: guía Cambiar Parámetros→8620, 3 inputs ms con Δ vs actual, badge color-coded, notas opcionales, checkbox "Aplicar a config". Botón "📟 Leer Z2" en ProductoTab. (v2.131.0)
- ✅ Firestore: colección `flipperZ2Captures` (delayFlipperOpenMs, minFlipperOpenTimeMs, delayFlipperCloseMs, cycleTotalMs, notes?, measuredBy, measuredAt). Reglas en `firestore.rules` con validación de campos.
- 🔮 **Futuro big bet**: driver Remote Connection Marelec en IP 172.27.12.12 para lectura en vivo de parámetros (requiere reverse-engineering del protocolo RC o contacto con soporte Marelec)

**Docs parseados (barrido 2026-04-17 representativo ~25 imágenes del DOCX 418 total)**:
- `parametros grader.docx` (8 MB, 418 PNG screenshots HMI)
- **Doc completo con mapa de parámetros**: [`docs/marelec-z2/parameters.md`](docs/marelec-z2/parameters.md)

**Hallazgos adicionales del barrido profundo**:

Canales de comunicación:
- `modbusId = 0` en HMI — Modbus **soportado pero deshabilitado**. Poner a ≥1 para habilitar integración Modbus TCP desde app vía IP 172.27.12.12.
- `ftpLogServer = "ftp.marelec.com"` — Z2 puede subir logs a servidor Marelec externo (investigar)
- CAN bus: `canIdIo1-7 = 51-57` (8-port mode), `canIoType` define modo 8 vs 12 outputs
- Remote Connection (RC) — protocolo propio Marelec usado por HMI remoto (potencial reverse-engineering)

Múltiples cintas con timings propios (CRÍTICO — nuestra app asume 1 sola):
- **Grading belt (static grader)**: `maxSpeed = 700 mm/s` (0.70 m/s)
- **Z-belt**: `maxSpeed = 420 mm/s` (0.42 m/s)
- **Acceleration belts 1 y 2**: config con `inpPulse`, `deltaI=52000`, `deltaIdiv=39623`, `length=1000mm`
- **NO todas corren a la misma velocidad** — nuestra app asumía 1.28 m/s único

Distinción crítica: **Pocket ≠ Flipper** (sistemas mecánicos DIFERENTES):
- **Pockets (balanza)**: `pos=550mm`, `minOpen=600ms`, `delayClose=700ms`, `canId=11`, loadcell calibrado con `fsWc=273947`, `zpWc=864997`
- **Flippers (grading belt)**: `delayFlipperOpen=150ms`, `minFlipperOpenTime=350ms`, `delayFlipperClose=150ms`, `outpFlipper1-12=133-152`

Gate/Batch timing (separados del flipper):
- `delayBeforeGateClose = 400 ms`, `delayGateClose = 500 ms`, `minGateOpen = 0 ms`, `maxBinWeight = 25000 g`

Sensores y seguridad:
- `inpEmergency`, `inpAirSupply`, `inpCleaningMode`, `rejectNoSync = 1`
- 3 eye sync posibles (solo 1 usado: `disEyeSync=425mm`, `inpEyeSync=3`)
- Weight feedback: `wFeedbackMaxStabilizationTime=2000ms`, `wFeedbackSimulStdev=10`

Calibración:
- Password servicio: **8620**
- `fsWc` = fullscale weight correction (instructivo CH-MT-ME-0002)
- `tSteady = 300 ms`, `trackZero = 1`, `minWeight = 300 g`, `dispRes = 10`
- FIR filters per pocket: `filter1=60`, `filter2=70`

**Implementación actualizada en mockup `producto-v2-mockup.html`**:
- ✅ Sección "⚙️ Equipo flipper" reestructurada en 3 sub-cards:
  - A) **Ciclo flipper (software Z2)** — inputs delayOpen/minOpenTime/delayClose + total 650 ms
  - B) **Reset mecánico cilindro neumático** — medición slow-mo + badge estimado
  - C) **Paleta flipper (física)** — largo 475mm + altura 0.5mm
- ✅ Modal "🎥 Medir con slow-mo" — guía paso-a-paso + SVG iPhone 240fps + frames/240=s
- ✅ Modal "⚙️ Medir velocidad cinta con tacómetro SKF" — SVG vista lateral con rueda de contacto, DOs/DON'Ts, 3 zonas, promedio
- ✅ Velocidad cinta editable con badge "Z2 config maxSpeed=700 mm/s · medir en terreno"

**Nuevas oportunidades big bet** (ordenadas por impacto/esfuerzo):
1. 🎯 **Habilitar Modbus TCP en Z2** y leer parámetros en vivo (esfuerzo medio — cambiar `modbusId=0→1` + cliente Modbus TCP en PWA apuntando a 172.27.12.12)
2. 🎯 **Múltiples cintas separadas en app** (esfuerzo bajo — agregar Z-belt, Acc 1, Acc 2 al modelo)
3. 🎯 **Pocket timing separado de flipper** (esfuerzo bajo — renombrar y separar análisis)
4. 🔮 **Reverse-engineer protocolo RC Marelec** (esfuerzo alto — pedir SDK a soporte Marelec)
5. 🔮 **FTP log sync con ftp.marelec.com** (requiere permiso Marelec)

### P1.11 — ✅ COMPLETADO 2026-04-17/18 — FASES 11-14 Análisis Grader refactor + auditoría P0

**Plan de referencia**: `docs/PLAN-ANALISIS-GRADER-FASES-11-16.md`

**FASE 12 — Landing unificado + vista TurnoPage**
- ✅ `AnalisisGraderLandingPage`: hero + últimos turnos (8) + 4 accesos rápidos en fila + calendario full-width. `max-w-screen-xl`.
- ✅ `AnalisisGraderTurnoPage`: scorecard HeroScorecard + P0CausesPanel (2/3) + ActionPlanPanel (1/3) + ShiftTimelineView full-width. Ruta: `/analisis-grader/turno/YYYY-MM-DD__Turno%20día`
- ✅ Fix critical: todos los `useMemo` antes del early return (react-hooks/rules-of-hooks).
- ✅ Firestore rules: colección `graderShifts` (read auth / create+update supervisor / delete admin).

**FASE 13 — Timeline + panel acciones**
- ✅ `ShiftTimelineView`: gráfico ECharts P0%/minuto + markLines uploads/acciones + checkpoints cronológicos.
- ✅ `ActionPlanPanel`: sugerencias tripartitas terreno/oficina/verificar derivadas de causa dominante P0. Checked-state en localStorage.
- ✅ `deriveSuggestions()`: lógica rule-based para `fuera_de_limites`, `no_leido_fotocelula`, `puerta_no_preparada`.
- ✅ `graderShifts.service.ts`: `GraderShiftDoc` con `uploads[]` y `actions[]`.

**FASE 14 — Runbooks Z2 + página Ayuda + glosario**
- ✅ `graderRunbooks.ts`: 10 runbooks oficiales (contrastacion/calibracion/mantencion/limpieza/troubleshooting). Triggers, fórmulas, Z2 paths, serviceKey.
- ✅ `graderGlossary.ts`: 16 términos Marelec Z2.
- ✅ `RunbookCard.tsx`: expandible con check de pasos por sesión, fórmula monospace, badge Z2 path.
- ✅ `AnalisisGraderAyudaPage`: buscador + filtros categoría + glosario colapsable + PDFs. Ruta: `/analisis-grader/ayuda`.
- ✅ `ActionPlanPanel`: prop `relatedRunbooks` — muestra RunbookCards contextuales vía `findTriggeredRunbooks`.

**Auditoría Opus 4.7 + fixes P0/P1 (2026-04-18)**
- ✅ **P0**: Timeline carga desde sub-collection real (`loadTimelineAggregates`) en vez de `[]` hardcodeado.
- ✅ **P0**: `findTriggeredRunbooks` cubre las 4 causas P0 (lookup table `causeMetricMap`). Triggers agregados a `slow-mo-flipper`, `presion-aire`, `reset-boton-azul`.
- ✅ **P0**: Turno en vivo sin datos → empty-state con CTA "Cargar Excel" en lugar de error confuso.
- ✅ **P1**: `shiftWindow` convertido a `useState` + `setInterval(60s)` cuando status=live — progress bar actualiza en tiempo real.
- ✅ **P1**: Acciones marcadas se persisten en Firestore (`graderShifts.actions[]`) vía `appendShiftAction` fire-and-forget.
- ✅ **P1**: `dominantCause` calculado una sola vez via `useMemo dominant` (era llamado 2× por render).

**Commits sesión**: `510fffd2`, `138740bc`, `382f768a`, `c51b1f3c`, `2f5ccba2`, `5ee6d773`
**CI**: FASE 12 deploy ❌ (ESLint rules-of-hooks, corregido en FASE 13). FASE 13 y 14 ✅ verdes.

**✅ FASE 15 (2026-04-18, `e45d3a2d`)** — Benchmark + Attribution en PeriodoPage
- `graderBenchmarks.ts`: `SeasonBenchmark` + `compareAgainstBenchmark` (verdict better/similar/worse + delta por causa)
- `graderAttribution.ts`: `computeShiftAttribution` por turno + `aggregateAttribution` cross-shift
- `BenchmarkComparisonCard` + `TopActionsCard`: muestra comparativa vs temporada 2025-2026 (5.37M PP, 206k P0, 3.84% base)
- Benchmark JSON estático: `data/benchmarks/temporada-2025-2026.json`

**✅ FASE 16 (2026-04-18, `01d5a4ba`)** — IA integrada en TurnoPage + prompt enriquecido
- `analyzeGraderFromSummary(summary, recentTurns?, ctx?)` acepta `SummaryAIContext` con `actions[]` y `benchmarkDelta`
- `TurnoPage`: botón "Generar análisis IA" con loading state + `AIOutputPanel` inline
- WARN: el cleanup de `WizardPage → Navigate` rompió el golden path de upload; corregido en FASE 17.

**✅ FASE 17 (2026-04-18, `f2df58a3`)** — Rediseño Landing responsive + fix golden path roto
- Restaurado `WizardPage` original (FASE 16 lo había convertido prematuramente en redirect sin reemplazo real)
- `AnalisisGraderLandingPage` rediseñado: hero inteligente con turno vivo, grid xl:12-col asimétrico (5/7) con recientes + calendario lado a lado, mobile scroll-horizontal con snap, tablet/mobile calendar colapsable
- Eliminado `AnalisisGraderDetallePage.tsx`; ruta `/detalle` resuelve con redirect inline en `App.tsx` preservando compat con links externos
- 7 call-sites migrados de `/analisis-grader?date=X&shift=Y&autoload=1` (ignorados por Landing) a `/turno/:id` directo
- Eliminado link `/turno/:id/setup` inexistente y botón "Ver análisis completo (dashboard)" obsoleto
- `TurnoPage` carga `SeasonBenchmark` y pasa `benchmarkDelta` al prompt IA (el param estaba muerto)
- Fix ESLint warning exhaustive-deps en TurnoPage:118 con justificación documentada
- Rutas finales: `/analisis-grader` (Landing), `/analisis-grader/turno/:shiftId`, `/analisis-grader/periodo`, `/analisis-grader/ayuda`, `/analisis-grader/wizard` (carga legacy + gates config), `/analisis-grader/detalle` (→ redirect)
- PeriodoPage: container unificado + botón back consistente + BenchmarkCard/TopActionsCard en grid 2-cols desktop

### P1.5 — ✅ COMPLETADO 2026-04-09 (sesión siguiente)
- ✅ **Input sanitization Firestore**: 16 colecciones validadas en 4 lotes (162e0d1e, 78908d73, 35262779, 601d7a00). Total: 23 colecciones con isValid*() en firestore.rules. Deploy Firestore Rules 🟢.

### P2 — Mejoras UX futuras
- ✅ **Modo alto contraste en calendario** (57345d13): override CSS `.high-contrast` para clases hardcoded `bg-zinc-*`, `text-zinc-*`, `bg-cyan/amber/violet-500/5`, `bg-*-950/60`. Verificado con 9/9 tests programáticos.
- ✅ **Editor sidebar mobile** (55b81fbc): touch target handles 20px → 44×44px (WCAG), TouchSensor delay 250→200ms, tolerance 5→8px, aria-label en handles.
- ✅ **Visor interactivo de flujos** (sesión 2026-04-13): `FlowDiagramViewer` con nodos clicables (trigger → pasos → fin), tooltips expandibles, conectores animados. Reemplaza `FlowsList` plano en MachineLearningPage.

### P3 — Mantenimiento menor no urgente
- ✅ **Warnings React Hook exhaustive-deps** (f9bf1779): 10 → 1 warning. Margen CI 9.
- ✅ **Node.js 20 → 24** en los 4 workflows GitHub Actions (sesion 2026-04-10).
- ✅ **TerrainMesh fast-refresh warning**: `useTerrainData` movido a `useTerrainData.ts` propio (sesion 2026-04-10).
- ✅ **Dependabot 8→1**: xmldom, minimatch, picomatch corregidos en lockfile. Restante: rollup@4.54.0 HIGH vía vite-plugin-pwa (devDep build-only, requiere hashes de red para actualizar).
- ✅ Rollup 4.54.0 → 4.60.1 (sesión 2026-04-13, pnpm update rollup --recursive)

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

## Histórico Grader — arco de iteraciones completadas

### Pendientes vivos sin dueño de prioridad (P2 contenido)
<!-- Seguridad y Marel descartados — decidido no continuar (sesión 2026-04-15) -->

### Refactor iter 1 → iter 5 (2026-04-10/11) ✅

Arco cerrado. Dashboard **5262 → 1485 líneas (-72%)**, score global **61.4 → 88.0 (+43%)**.

| iter | Dashboard | Score | Cambio clave | Commit |
|---:|---:|---:|---|---|
| 1 (baseline) | 5262 | 61.4 | Mega-componente inicial | — |
| 2 | 4495 | 71.4 | `useGraderDashboardAnalytics` + helpers + inline panels | `161d7945` |
| 3 | 2836 | 78.6 | Extraer 5/6 sub-tabs | `ee7d7f8d` |
| 4 | 1817 | 84.2 | Extraer `GraderPuntoCeroTab` | `81db31a6` |
| **5** | **1485** | **88.0** | `useGraderPatternAnalytics` + unificar helpers | `94067ad7` |

**Arquitectura actual**: Dashboard orquestador (1485) + 2 hooks analytics + 6 sub-tabs autocontenidos (Matriz 162, Compuertas 270, Sugerencias 107, Lotes 413, Tendencia 1053, Punto Cero 1157) + `graderDashboardHelpers.ts`.

### Iter 6 — Config física real + insights físicos (2026-04-11, v2.74.0) ✅

`DEFAULT_PHYSICAL_CONFIG` con velocidades Z2 reales (Z-Belt 0.39, Accel1 1.03, Accel2 1.23, Sorting 1.28 m/s), `z2ProgrammedDistancesMm` reales (12 valores no uniformes), longitudes cintas aceleración reales, causas P0 reales desde pantalla Z2, `GraderResumenRapido`, widget inline velocidad Sorting Belt editable, `physicalConfig` cargado de Firestore al montar, insights #17 (gate sobrecargada >35%) y #18 (conflicto timing Z2), tabla velocidades Z2 en UI.

### Iter 7 — Carga masiva histórica (2026-04-11 tarde) ✅

`AnalisisGraderCargaMasivaPage` + `graderSegmenter.ts` + calendario con badges PP/P0, banner multi-día en wizard, merge inteligente PP+P0 (subir PP y P0 por separado no borra datos del otro).

### Iters 8 → 18.1 — Maratón 2026-04-12 (v2.76 → v2.86.1) ✅

13 commits. Rebuild total de temporada desde 30 Excel locales (5.37M PP + 206k P0 → 379 summaries limpios), fix segmenter timestamp-first, hourlyBuckets agregados a summaries, fix TZ display, minutos activos reales. Commits `24292*`–`24295*`.

<!-- completados anteriores (sesión 2026-04-10)
- Grader P0 #1-#7: proyección turno, chart peso toggle, badge P0 header, umbrales colapsables, IA tendencia multisesión, comparativa día/noche, detección degradación sensores
- Skill evaluar-modulo + rutina de sesión 2 pasos
-->

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

**Objetivo del módulo**: Soporte de decisiones en tiempo real para operadores de clasificadora (grader) de salmones durante un turno activo. También tiene un módulo de historial donde se acumulan turnos pasados para análisis tendencial.

**Dos modos de uso:**
1. **Turno activo**: subir Excel del turno en curso → análisis en tiempo real → sugerencias
2. **Historial**: subir archivos históricos PP+P0 → se acumulan en calendario → ver tendencias por día

**Arquitectura de datos**:
- `PIEZA_PIEZA`: fuente de verdad (peso, calibre, calidad, gate, lote, timestamp)
- `PUERTA_0`: enriquece razones de rechazo (fotocélula, fuera de límites, etc.)
- Gate 0 = "Punto Cero" = rechazados. 12 gates activas.
- El % de P0 es el KPI principal del turno.
- `graderDailySummaries` Firestore: `${dateKey}__${shiftId}` — resúmenes persistidos por turno

**Archivos clave**:
- `AnalisisGraderWizardPage.tsx` — página principal (upload + banner multi-día + dashboard)
- `AnalisisGraderCargaMasivaPage.tsx` — batch upload de múltiples archivos históricos
- `AnalisisGraderCalendarPage.tsx` — calendario histórico con badges PP/P0 + `?goto=YYYY-MM-DD`
- `AnalisisGraderUploadPage.tsx` — dropzone unificado con auto-análisis
- `AnalisisGraderDashboardPage.tsx` — dashboard completo
- `services/grader/graderSegmenter.ts` — segmenta registros por {día × turno}, `hasPieceData`/`hasGate0Data`
- `services/grader/graderDailySummary.service.ts` — merge inteligente PP vs P0-only
- `services/grader/graderAnalytics.ts` — motor de cálculo KPIs
- `services/grader/graderInsights.ts` — insights deterministas + tendencia P0
- `services/grader/types.ts` — tipos (ParsedMatrixData, GraderDailySummary, etc.)

**Flujo incremental PP+P0 (iter 7):**
- Subir PP solo: `hasPieceData: true, hasGate0Data: false` → "Falta P0" en calendario
- Subir P0 solo después: merge parcial en Firestore (`{ merge: true }`) → solo actualiza `topP0Causes` + `hasGate0Data: true`, preserva KPIs del PP
- El banner en WizardPage se activa con `multiDayInfo` useMemo (detecta > 1 día único)
- `multiDayInfo.isP0Only` = true cuando solo hay gate0Records → banner dice "actualizará causas P0 sin borrar datos PP"

**Config física real (iter 6)**:
- `DEFAULT_PHYSICAL_CONFIG` en `graderAnalytics.ts` tiene los valores reales de la MS4/12
- Factor conversión Z2: `z2BeltSpeedScale = 0.000786` m/s por unidad (anchor: 1781 unidades = 1.4 m/s)
- `z2ProgrammedDistancesMm`: 12 valores individuales, no uniformes

**TypeScript gotchas (IMPORTANTES)**:
- Localmente hay TS 6.0.2. El proyecto usa TS 5.7.x. NO agregar `ignoreDeprecations: "6.0"` al tsconfig.
- Siempre verificar que `noUnusedLocals` pase: al eliminar código buscar helpers huérfanos con grep.
- `noUncheckedIndexedAccess: true` → `array[i]` devuelve `T | undefined`. Usar `array[i]!` cuando el contexto garantiza existencia.
- **NUNCA** usar `push(...largeArray)` — desborda call stack con 100k+ elementos. Usar `pushAll()` o loop.
