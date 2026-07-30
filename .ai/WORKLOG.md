# WORKLOG — bitácora de agentes (append-only)

Una entrada por bloque de trabajo. La más reciente arriba. Formato:

```
## YYYY-MM-DD · <agente> · <tarea>
- Hecho: ...
- Archivos: ...
- Verificación: tsc/eslint/preview ...
- Estado: HECHO | EN REVISIÓN | PENDIENTE
- Sigue: ...
```

---

> **Compactado el 2026-07-30.** Las entradas anteriores al 2026-07-19 se resumieron en bloques
> temáticos al final de este archivo (el detalle completo de cada una vive en git:
> `git log -p .ai/WORKLOG.md`, y en los commits de cada PR). Los pendientes que seguían abiertos
> se consolidaron en "Pendientes que vienen de atrás" — no se perdió ninguno.
> El archivo pasó de 143 KB a 36 KB porque estaba duplicando lo que ya dicen los commits.

## 2026-07-30 - claude - Pobla la Enzunchadora TP-6000: 9a y ultima maquina del Centro de Aprendizaje (PR #296)

- Hecho: la Enzunchadora N2 (Transpak TP-6000-1) estaba en 0/4 secciones; la memoria decia que no habia material en OneDrive pero SI existe (`TRANSPAK_TP-6000-1_Manual_operacion_y_repuestos.pdf`, 124 pags) — la busqueda vieja fallaba por buscar "N2" en vez de "TP-6000". Se curo del manual (ingles, PARTE I pags. 1-22, con la tabla de Troubleshooting rasterizada y transcrita): 7 secciones de Manual, 5 Procedimientos, 4 Flujos, 5 Diagnosticos, Consulta rapida (8 grupos, sin "Claves de acceso" porque no hay clave documentada) y 18 preguntas de Evaluacion. Con esto el Centro de Aprendizaje queda completo, 9/9 maquinas. Se corrigio ademas el shuffle de opciones del seed (concentraba correctas en B) por uno deterministico, y se agrego `--only=<slug>` a `seed-quiz-maquinas.js` para no pisar preguntas de otras maquinas ya editadas desde el panel admin.
- Archivos: `apps/pwa/src/services/enzunchadora/enzunchadoraContent.json` (nuevo), `apps/pwa/src/services/enzunchadoraLearning.ts` (nuevo), `apps/pwa/src/services/learningContent.ts`, `apps/pwa/src/data/{learningMachines.ts,learningQuickRef.ts}`, `scripts/seed-quiz-maquinas.js`.
- Verificacion: tsc limpio; seed a Firestore con `--only=enzunchadora-n2` (dry-run antes); verificador-web PASA CON RESERVAS contando por numero (8/7/5/4/5, evaluacion "01/18" responde CORRECTO con explicacion); card del hub 4/4 con badge "Nuevo"; buscador por sintoma "fleje"→3 resultados y "sello"→1 (el seed SI entra al indice); movil 375px sin scroll horizontal.
- Estado: HECHO — PR #296 mergeado (squash+admin), deploy a GitHub Pages disparado automaticamente al mergear.
- Sigue: buscar "sellado" (literal) no encuentra nada — el indice cubre titulo+sintoma, no el texto completo de la solucion (no bloqueante); falta verificar tema claro/oscuro en esta ficha y las 18 preguntas una por una; falta uso real de un tecnico en terreno.

## 2026-07-30 - claude - Alertas y brief de Filete con umbrales propios

- Hecho: (1) la config de notificaciones pasa a 3 capas en `functions/shoplogix/notifConfig.js` (DEFAULTS -> overrides por planta -> Firestore) con `shiftEnd.minPieces` nuevo: Filete exige 200 piezas y el eviscerado sigue en 50. Motivo REAL: el lote de prueba de 59 piezas del 28-jul disparo un brief de fin de turno como si fuera un turno productivo. (2) El brief muestra la OPERACION REAL (`effectiveStart/End`) cuando la ventana del turno es >=25% mas ancha: decia "Horario real: 08:00 -> 08:00" porque el "Turno Dia" de Filete abarca 24 h; ahora dice "Operacion real: 09:56 -> 16:11". (3) Nueva linea "N paros sin causa anotada (Nm) — anotala en Analisis de Turno", que cruza los paros del sensor con las anotaciones de `paros` (via la misma clave determinística `sensorStopKey`) — el brief es el momento en que alguien todavia se acuerda de lo que paso. (4) `minPieces` editable en el Panel Admin. (5) Copy: "piezas por Baader" -> "por maquina" en briefs/tools, y la tool de produccion de ARIA ahora detecta filete.
- Archivos: `functions/shoplogix/{notifConfig.js (nuevo),turnoBrief.js,__tests__/{notifConfig.test.js (nuevo),turnoBrief.test.js}}`, `functions/index.js`, PWA: `pages/admin/ShoplogixNotificationsConfigPage.tsx`, `services/shoplogix/shoplogixNotifConfig.service.ts`.
- Verificacion: 90 tests de functions verdes (5 nuevos de notifConfig + 3 del brief), 761 de la PWA, tsc y eslint limpios. Renderice el brief con los DATOS REALES del 28-jul antes y despues: antes "Horario real: 08:00 -> 08:00" y se enviaba con 59 piezas; ahora con 59 piezas NO se envia (umbral 200) y con un turno real sale "Operacion real: 09:56 -> 16:11" + "1 paro sin causa anotada (23m)".
- ⚠ PENDIENTE de verificacion visual: el Panel Admin de notificaciones exige re-autenticacion con contraseña, asi que el input nuevo de `minPieces` no lo pude ver en pantalla (el resto se verifico). Orel: mirarlo al entrar.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado, primer turno real de Filete — confirmar que el brief sale con la ventana real y que el umbral de 200 es el adecuado; ver si `scrapReasons` viene poblado (habilitaria OEE completo A*P*Q).

## 2026-07-30 - claude - OEE del AREA: maquina instrumentada + etapas sin sensor (la GEA)

- Hecho: la tarjeta de OEE de linea pasa a ser OEE del AREA y se habilita en toda linea con Shoplogix (antes solo con Grader, asi que Filete no la veia). Calculo extraido a `services/grader/areaOeeCompute.ts` (testeado): `A_area = uptime / (tiempo rastreado por el sensor + paros de etapa)`, R del cuello de botella, y donde no hay Grader el OEE se muestra como **A×R con chip rotulado** en vez de fingir calidad 100%. El pareto ahora reparte el downtime de la maquina POR CAUSA ANOTADA (el pago de la feature anterior) y expone lo que falta anotar en vez de esconderlo.
- ⚠ Doble conteo resuelto con una REGLA explicita: un paro de etapa solo suma tiempo si NO detuvo la maquina. Si la detuvo, ya esta en el downtime del sensor y va como causa de ese paro (`origen:'shoplogix'`, que `computeAreaOee` excluye del tiempo adicional).
- Fixes que salieron de mirar datos reales: `MachineKPI` expone `uptimeMin/downtimeMin/setupMin` (antes la base de tiempo se DERIVABA de `downtime/(1-A)` y fallaba sin averias macro); `machineType` se propaga a los KPIs y en la agregacion gana el primer tipo CONOCIDO (los turnos sin produccion quedan congelados en 'other' y borraban el modelo del mes); etapas sin sensor por linea en `plantLines.ts` (Filete: GEA, cintas, enzunchadora — antes ofrecia Bombeo/Chiller/Grader del eviscerado); `getAreaDisplayLabel` para que el titulo no diga "Filete · Filete".
- Bug de UX encontrado probando: registrar un paro no movia el OEE hasta recargar (la card leia los paros solo al montar). Ahora `ParoEtapaCapture` avisa (`onChanged`) y la card relee.
- Archivos: `services/grader/{areaOeeCompute.ts (nuevo),plantKpiCompute.ts,__tests__/areaOeeCompute.test.ts (nuevo)}`, `components/grader/{LineOeeCard.tsx,ParoEtapaCapture.tsx}`, `services/shoplogix/shoplogixMachines.ts`, `config/plantLines.ts`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificacion: tsc limpio, eslint sin errores, 761 tests (9 nuevos de `computeAreaOee`, incluido el caso de doble conteo). Punta a punta en produccion con Filete: registre un paro de la GEA de 45 min → OEE maquina 7% vs **OEE area 3%** ("disponibilidad 33% → 14%, base 1h 19m") y pareto "1. GEA (etapa) 45 min · 2. Paros sin causa anotada (maquina) 23 min"; al borrarlo desde la UI volvio a 7% SIN recargar. Produccion quedo limpia (0 paros, 0 maintenanceLog).
- Estado: EN REVISION — PR abierto.
- Sigue: #6 (alertas y brief de Filete con umbrales propios). El sabado: primer turno real.
## 2026-07-30 - claude - Arregla los 2 crones que fallaban por la proteccion de main (PR #292)

- Hecho: causa raiz comun — `main` exige el check "build" con `enforce_admins: true`, ninguna escritura directa entra. `Daily Sync (versions)` fallaba desde el 24-jul (`GH006`): se le quito el `schedule` y `version.ts` ahora se sincroniza solo via `prebuild` y el nuevo `dev` (`sync:version && vite`); el workflow queda de auditoria manual. `Weekly NanoBanana Check` fallaba 3 domingos seguidos (`HTTP 409`): ahora sube a la rama sin proteccion `nanobanana-assets`.
- Archivos: `.github/workflows/{sync-version.yml,nanobanana-weekly.yml}` (o equivalentes), `apps/pwa/package.json` (script `dev`), `.claude/launch.json` (`autoPort`).
- Verificacion: sintaxis .py/.yaml OK; sync manual llevo `version.ts` 3.99.1→3.99.6; `pnpm dev` encadena bien; los 2 workflows disparados a mano en `success` (antes fallaban siempre); NanoBanana genero imagen valida (PNG real, HTTP 200) y abrio issue #291. Check "build" del PR: pass.
- Estado: HECHO — PR #292 mergeado (squash+admin), deploy a GitHub Pages y Firebase Hosting disparado automaticamente al mergear.
- Sigue: confirmar en el proximo domingo/medianoche que los 2 crones corren solos sin intervencion.

## 2026-07-30 - claude - Grafico velocidad real vs objetivo del sensor

- Hecho: el grafico de tasa (pz/min) de la vista de turno ahora superpone el OBJETIVO por bucket que reporta el sensor (`targetRate`, con `expectedCycles/duracion` de respaldo en docs viejos) como linea punteada, y sombrea los tramos con objetivo vigente y produccion 0 ("parada con objetivo"). Ademas corrige el objetivo NOMINAL: se tomaba del PRIMER bucket con expected>0 — que es parcial y miente (en el turno del 28-jul de la Baader 200 daba 5 pz/min cuando el objetivo real era 20). Ahora es el maximo por bucket, mismo criterio que `targetCpmFromIntervals`.
- Por que importa: separa "la maquina no da el ritmo" de "la maquina estuvo parada". En el 28-jul la Baader 200 llego a 19,0 contra objetivo 20 → el turno no se perdio por velocidad sino por 20 min parada.
- Archivos: `apps/pwa/src/components/grader/ProductionRateLineEC.tsx`, `apps/pwa/src/components/grader/__tests__/productionRateTarget.test.ts` (nuevo).
- Verificacion: tsc limpio, eslint sin errores nuevos, 752 tests verdes — incluidos 6 nuevos que corren `buildRateSeries` con la SERIE REAL del 28-jul y fijan: nominal 20 (no 5), objetivo variable por bucket, el bloque unico de 20 min parado, real != objetivo, y degradacion limpia sin `targetRate` ni `expectedCycles`.
- ⚠ PENDIENTE de verificacion VISUAL: el panel del navegador dejo de componer frames a mitad de la sesion (ECharts pinta en canvas, no renderiza sin pane visible), asi que el grafico no se pudo ver corriendo. La logica esta cubierta por los tests con datos reales, pero hay que mirarlo con ojos antes de darlo por cerrado.
- Estado: EN REVISION — PR abierto.
- Sigue: mirar el grafico en pantalla (Filete 28-jul y un turno de Yal con 3 maquinas, cada una con su propio objetivo 16/19). Pendientes #5 (OEE de area con la GEA manual) y #6 (alertas de Filete).

## 2026-07-30 - claude - Causa de los paros del sensor (dictado) + parametros del sensor

- Hecho: (1) el sync guarda lo que el sensor mandaba y se descartaba — `targetRate` por intervalo (cadencia OBJETIVO, no la real: `expectedCycles = rate x 5min` y hay tramos con rate 20 y cycles 0), `uptimeCycles`/`scheduledCycles`, `scrapByReason`/`scrapTotal` (unica fuente posible de Calidad en Filete) y las unidades; `machineType` de la Baader 200 ya no cae en 'other'. (2) La vista de turno dejo de contar falso en lineas sin turno acotado: el ritmo se mide sobre la ventana REAL de operacion (Filete pasaba de 2 a 9 pz/h) y el copy "Baader 142"/"Evisceradoras" se deriva de `machineType`. (3) NUEVO panel "Causa de los paros": lista los paros que el sensor midio, el tecnico dicta el por que (voz -> `refineText` -> guardar), se clasifica por responsable (mantencion/operacion/externo/planificado) y las de Mantencion pueden ir al historial del equipo.
- Modelo de datos: las causas van a `paros` con `origen:'shoplogix'` + doc id determinístico `sensorStopKey(...)` (re-anotar CORRIGE, no duplica). Se reusa `paros` en vez de crear coleccion nueva para no tocar `firestore.rules`. ⚠ `LineOeeCard` sumaba todos los `paros` al OEE de area: ahora filtra `origen !== 'shoplogix'`, porque esos minutos ya los descuenta la Disponibilidad del sensor (habria sido doble conteo).
- Archivos: `functions/shoplogix/{normalizer.js,__tests__/normalizer.test.js}`; PWA: `components/grader/{SensorStopsCausePanel.tsx (nuevo),ShoplogixOnlyScorecard.tsx,UpstreamMachinesPanel.tsx,LineOeeCard.tsx}`, `services/{paros.ts,shoplogix/*}`, `types/index.ts`, `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: tsc limpio, eslint sin errores, 746 tests PWA + 20 de functions verdes. Punta a punta en produccion con el turno real del 28-jul: el panel listo el unico paro real (22,8 min a las 15:45, ≈455 pz al objetivo de 20 pz/min), se guardo la causa, quedo el doc en `paros` con su stopKey y la entrada en `maintenanceLog` (origen `paro_sensor`) — los 2 docs de prueba se borraron despues. En Yal (paros ya clasificados por el sensor) el panel muestra los 5 mas largos con boton "Detallar" y un toggle para el resto.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado, primer turno real de Filete → mirar si `scrapReasons` viene poblado (habilitaria OEE completo A*P*Q sin Grader), validar el objetivo de 20 pz/min y probar el dictado por voz en planta. Pendientes #3 (grafico velocidad real vs objetivo), #5 (OEE de area con la GEA manual) y #6 (alertas de Filete).

## 2026-07-29 - claude - Filete visible en calendario y resumen del mes ("Turno Dia")

- Hecho: con los datos ya sincronizados aparecieron 4 puntos donde el nombre del turno se comparaba contra listas/strings fijos y Filete quedaba invisible: (1) el calendario buscaba solo `Turno 1/2/3` → ahora descubre los turnos REALES del dia desde los docs; (2) `dayScanned` miraba solo claves de Chonchi; (3) el bucket dia/noche usaba una heuristica horaria de Yal que mandaba "Turno Dia" (07:30 local) a la noche → ahora el nombre explicito manda; (4) `SHIFT_META_TABLE` no tenia "Turno Dia" → la UI mostraba "?". Ademas, la grilla T1/T2/T3 del resumen mensual cae a Dia/Noche cuando la linea no usa esa nomenclatura (antes mostraba 0/0/0 con turnos productivos).
- Archivos: `apps/pwa/src/components/grader/{GraderHistoricalCalendar.tsx,GraderMonthlyStatsPanel.tsx}`, `apps/pwa/src/services/grader/graderShiftDisplay.ts`.
- Verificacion: `tsc` limpio, 741 tests verdes, eslint sin errores. En preview con datos reales: el 28-jul pasa de "sin proceso" a **D · 59**, y el resumen del mes de "07-28 · ?" + "T1 0 · T2 0 · T3 0" a "07-28 · Dia" + "1 Dia · 0 Noche". Yal (mayo) sin regresion: mantiene sus chips Excel Dia/Noche + SLX T2/T3.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado arranca el proceso normal de Filete; mirar el primer turno real y ajustar `defaultShiftSchedule` con los horarios que emita Shoplogix.

## 2026-07-29 - claude - Filete conectado a Shoplogix (deja de ser "próx.")

- Hecho: la pestaña Filete de Análisis de Turno pasa de deshabilitada a línea viva con datos Shoplogix. Nuevo `plantSlug` **`filete`** (doc `shoplogix/filete`) con la ÚNICA máquina instrumentada del área: la **Baader 200 de Línea 1** (`3c0581da-…`, área Filetes areaid 8181). La GEA de filete no tiene integración todavía y no hay Grader aguas abajo → sin Excel, sin P0%, sin Calidad (el OEE queda en A·P, igual que Yal). De paso se parametrizaron los textos que decían "las 3 Baader"/"Evisceradora" en el KPI board: ahora salen de `machineKind`/`kpiScopeNote` de `plantLines.ts`, así que Filete no hereda copy del Eviscerado.
- Archivos: `functions/shoplogix/{machines.js,sync.js}` (registry + `ACTIVE_PLANTS`), `functions/index.js` (mapa plant→plantLineId para el deep-link de notificaciones, detección "filete" en ARIA), `functions/scripts/validate-plant-integration.js`; PWA: `config/plantLines.ts`, `services/shoplogix/{shoplogixMachines.ts,types.ts,shoplogixShift.service.ts}`, `components/grader/{PlantKPIBoard.tsx,UpstreamMachinesPanel.tsx}`, `components/settings/ProcessNotificationsPanel.tsx`, `services/aria/{tools/grader.ts,proactiveAlerts.ts}`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificación: `tsc --noEmit` limpio; eslint sin errores (solo warnings preexistentes); 741 tests PWA verdes; 78 tests de `functions/shoplogix` verdes; preview en `?linea=chonchi-filete` muestra la pestaña habilitada, el alcance correcto y "Sin datos Shoplogix" (esperado: el sync de `filete` recién corre cuando se despliegan las functions). Eviscerado sin regresión.
- Estado: HECHO — PR #286 mergeado y desplegado (functions + hosting en verde).
- Datos reales confirmados el mismo dia: el sync escribio `shoplogix/filete/shifts/*` solo, y el backfill 20→28 jul trajo el dia de pruebas de la Baader 200: **2026-07-28 "Turno Dia" = 59 ciclos** (el probe daba 42 en la ventana consultada + 17 Unscheduled). A 17.6% · P 21.1% · Calidad N/A.
- Aprendizaje clave: **Filete nombra su turno "Turno Dia"** (sin tilde, D mayuscula), distinto de Chonchi (T1/T2) y Yal (T1/T2/T3).
- Sigue: tras el merge, (1) `shoplogixProbe?plantSlug=filete` para ver qué turnos emite Shoplogix en el área, (2) `shoplogixBackfillRange?plantSlug=filete&from=…&to=…` para poblar histórico, (3) `node functions/scripts/validate-plant-integration.js filete <fecha>`, (4) ajustar `defaultShiftSchedule` de la línea con los horarios reales.

## 2026-07-26 - claude - Snapshot/restore de Firestore + workflow de eval de contenido (PR #284)

- Hecho: cierre de los 2 huecos pendientes del sistema agéntico. `scripts/firestore-snapshot.js` (list/dump/restore con dry-run por defecto) como red de seguridad antes de escrituras masivas a producción. `.claude/workflows/verificar-contenido-fichas.js` escrito para auditar contenido técnico de las 7 fichas contra manuales PDF, aún no ejecutado a propósito.
- Archivos: `scripts/firestore-snapshot.js`, `.claude/workflows/verificar-contenido-fichas.js`, `.gitignore` (`_snapshots/`).
- Verificación: 5 pruebas reales contra producción del script de snapshot (list, dump, rechazo de ruta de documento, restore en dry-run, ayuda sin argumentos). El workflow de eval no se corrió (a propósito).
- Estado: HECHO — PR #284 mergeado y desplegado.
- Sigue: correr `verificar-contenido-fichas.js` cuando Orel lo pida.

## 2026-07-26 - claude - Sistema agéntico + optimización de contexto

- Hecho: capa de ejecución por costo con 3 subagentes globales en `~/.claude/agents/` (`verificador-web`, `implementador-patron`, `cerrador-pr`, todos model=sonnet) para que verificación en navegador, aplicación de patrones y cierre de PR no corran al precio del modelo del bucle principal. Nueva skill global `mockup-antes-de-construir` que vuelve mecánica la regla de mostrar mockup antes de construir UI. Optimización de contexto: `CLAUDE.md` con regla de costo obligatoria (nunca leer completo `_novedades.json` ~840 KB/210k tokens ni los `_MANIFIESTO.json`, solo grep/jq), lectura obligatoria partida en "siempre" (~20 KB) vs "según la tarea" (~42 KB). Memoria del Centro de Aprendizaje compactada de 68 KB a 15 KB (−78%).
- Archivos: `~/.claude/agents/*.md` (3 nuevos), `~/.claude/skills/mockup-antes-de-construir/SKILL.md`, `OneDrive\ANTARFOOD\CLAUDE.md`, memoria de Claude. Respaldo en `OneDrive\ANTARFOOD\_BACKUP_MEMORIA_CLAUDE\2026-07-26\`.
- Verificación: skill activa de inmediato; los 3 agentes requirieron reinicio de sesión para registrarse (confirmado). Ningún cambio en código de la app.
- Estado: HECHO
- Sigue: cerrar 2 huecos del checklist agéntico — recuperación (snapshot antes de escrituras masivas a Firestore) y evaluación (verificar contenido de las 9 fichas contra manuales fuente).

## 2026-07-25 - claude - Componentes del equipo: fotos reales con hotspots editables (PRs #278-#283)

- Hecho: "Componentes del equipo" del Grader pasó de ilustración SVG abstracta a 10 fotos reales con puntos numerados clicables y zoom/paneo. #278 primera foto real; #279 galería de 9 fotos más; #280 cada foto con hotspots + zoom/paneo (`ImageLightbox`); #281 migración a Firestore (`learningContent/{slug}/components/{id}`) + editor admin clic-para-agregar/arrastrar-para-mover; #282 botón "Administrar" en cada sección editable; #283 nota del punto activo fija bajo la foto + grid 2 columnas en desktop. Causa raíz del mal posicionamiento inicial: `object-fit:cover` con altura fija recortaba la foto; se resolvió con `aspectRatio` real de cada imagen.
- Archivos: `apps/pwa/src/components/learning/{GraderVisualPilot.tsx,HotspotDiagram.tsx}`, `apps/pwa/src/pages/{MachineLearningPage.tsx,LearningAdminMachinePage.tsx}`, `apps/pwa/src/services/learningContent.ts`, `apps/pwa/src/styles/learningDossier.css`, `scripts/seed-grader-components.js`, 10 fotos en `apps/pwa/public/learning-assets/grader/`.
- Verificación: tsc 0 en cada PR; check "build" verde en los 6; verificado en preview y en producción con las 10 fotos y hotspots bien posicionados.
- Estado: HECHO — 6 PRs mergeados y desplegados.
- Sigue: Orel debe probar el editor admin en vivo y decidir si marca los 4 candidatos SAP como repuestos comunes del Grader (`3300110019`, `3300103437`, `3300103438`, `3300103452`). Falta extender "Componentes del equipo" a las otras 8 máquinas.

## 2026-07-22 - claude - Fase 2: Cascada del mes (pestaña default) + Tendencia v3 con modo Comparar

- Hecho: (1) Pestaña "Cascada del mes" en la Vista panorámica (nueva DEFAULT — es la vista de la meta grande): cascada de pérdidas agregada de todos los turnos del mes desde `stateAggregates` del doc padre (0 reads; `cascadeFromMonthAggregates` en lossBuckets inyecta el uptime que los agregados excluyen). Muestra uso real vs uptime clásico lado a lado, techo de máquina, uso real por Baader, piezas máx teóricas del mes y top-10 piezas perdidas por causal con dueño y ×N eventos. Excluye Unscheduled (tiene su chip propio). (2) Tendencia v3: etiquetas de TODOS los días (solo número de día, interval 0 — el "4/7 no sale" era el eje saltando día por medio), marcador gris "sin proceso" al pie en días vacíos, y modo "Comparar" (default) con barras T2|T3 agrupadas + ambos promedios móviles; "Por máquina" solo en foco de un turno (en Comparar serían 6 series). (3) Fix previo verificando en prod: horario de columna de disponibilidad por MODA del mes (no primer turno hallado) y etiquetas sin adjetivos de jornada (T1 "mañana" mentía: su único día de julio es la madrugada renombrada del 8-jul); "~" ámbar cuando el horario sale de ≤2 días.
- Archivos: `apps/pwa/src/components/grader/{GraderHistoricalCalendar.tsx,UpstreamMachinesPanel.tsx}`, `apps/pwa/src/services/shoplogix/{lossBuckets.ts,__tests__/lossBuckets.test.ts}`.
- Verificación: tsc 0, lossBuckets 10/10. Prod verificado por DOM/canvas (pane de captura con glitch de render — screenshots negros; verificar por innerText/getImageData).
- Estado: EN DEPLOY con este push.
- Sigue: confirmar significado de LOGICA con el supervisor (17h de julio sin clasificar); considerar promover "uso real" a los KPIs del Resumen del mes tras validación de Orel.

## 2026-07-21 - claude - Cascada de pérdidas + ventana efectiva + taxonomía de causales (fase 1)

- Hecho: (1) `syncDay` guarda `effectiveStart/effectiveEnd` en el doc padre (primer→último estado uptime entre máquinas = "primer pescado→último"); backfill julio Yal 21/21 OK — ej. real: T2 14-07 programado 14:45→00:00 pero efectivo 14:54→21:30. (2) `lossBuckets.ts`: taxonomía causal→bucket con dueño (planificado=personas / externo=proceso / mantención=equipos / sin-clasificar visible / fuera-turno), calcada de los reasons REALES de julio en Firestore (COLACION, CUMPLIMIENTO CUOTA, FALTA MMPP, AJUSTE MANTENIMIENTO, CINTAS, ENERGIA→externo, Micro). Motiva: `shiftRuntime` actual incluye colación en el denominador (normalizer.js:215) → uptime subestimado e injusto. (3) `LossCascadeCard` en el panel upstream del TurnoPage: barra sobre el TECHO real (turno − planificado), cascada numérica con dueños, piezas máx teóricas (techo × cadencia real por máquina) y piezas perdidas por causal. (4) Tooltips calendario: horario real efectivo + uso de máquinas + labels reales T1/T2/T3 (fix "D/N (Shoplogix)" en Yal).
- Archivos: `functions/shoplogix/sync.js`, `apps/pwa/src/services/shoplogix/{lossBuckets.ts,shoplogixShift.service.ts,__tests__/lossBuckets.test.ts}`, `apps/pwa/src/components/grader/{LossCascadeCard.tsx,UpstreamMachinesPanel.tsx,GraderHistoricalCalendar.tsx}`, test fixture slxMonthResolve.
- Verificación: tsc 0, vitest 113/113 (8 nuevos lossBuckets), node --test functions 71/71. Functions desplegadas (sync wakeup/now/http/backfill) + backfill ejecutado y verificado contra docs reales.
- Estado: functions EN PROD; PWA se despliega con este push.
- Sigue: fase 2 — usar `usoReal` (techo) como uptime oficial en KPIs/mes; clasificar ENERGIA con Orel; cascada agregada mensual.

## 2026-07-21 - claude - Calendario Grader: tooltips mobile + total 24h + reconciliación post-brief Shoplogix

- Hecho: (1) `ChipTooltip` en `GraderHistoricalCalendar` — tooltip tap+hover (portal, cierre tap-fuera, patrón de `ui/InfoTooltip`) reemplaza los `title=` nativos de los chips Excel (primary/secondary/orphan), que eran invisibles en mobile; `renderShiftChip` pasó a componente `ShiftChip`. (2) Footer "Σ 24h" por celda: total del día calendario 00:00→24:00 sumando chips Excel primary + SLX día/noche visibles (sin doble conteo — mutuamente excluyentes vía hasExcelDay/Night); tooltip con desglose por turno, escala solo cuando Yal retome 3 turnos. (3) `checkShiftReconciliation` (CF NUEVA, cron 30 min): al enviar el brief de fin de turno se guarda `endBriefSnapshot`; se re-verifica +3h y +24h contra el doc padre; si el total cambió >20 pz o >3% → alerta Telegram "🔄 Corrección Shoplogix" (antes/después por máquina) + `correctionDetected`/`reconciliationNote` en el doc. (4) Brief de FIN de turno gana línea `🕐 Horario real` (scheduledStart/End de intervals — el de INICIO muestra la plantilla oficial del rollup, que puede diferir del horario real trabajado; no había horas hardcodeadas). (5) PWA lee los campos nuevos (`parseShiftParent`) y muestra badge 🔄 en los chips SLX del calendario con el detalle en tooltip.
- Archivos: `apps/pwa/src/components/grader/GraderHistoricalCalendar.tsx`, `apps/pwa/src/services/shoplogix/shoplogixShift.service.ts`, `apps/pwa/src/services/grader/__tests__/slxMonthResolve.test.ts`, `functions/index.js`, `functions/shoplogix/turnoBrief.js`.
- Verificación: tsc 0, vitest slxMonthResolve 16/16, node --test turnoBrief 16/16, `node --check` functions OK. Functions DESPLEGADAS a mano (service account) y confirmadas con `functions:list`: checkShiftReconciliation creada, checkShiftEndBriefs actualizada.
- Estado: HECHO — functions en prod; PWA se despliega con este push a main.
- Sigue: verificar la 1ª corrección real detectada (alerta 🔄 + badge en calendario); probar tooltips en mobile real.

## 2026-07-19 - claude - Power BI: export Grader + página "Análisis de Turno" — PR #252

- Hecho: retomado el pendiente de pulir el tablero Power BI piloto. `scripts/powerbi/export-powerbi-datasets.js` gana 3 tablas nuevas del Grader (`graderDailySummaries` → `fact_grader_turnos`/`fact_grader_p0_causas`/`fact_grader_calibres`) más fix de `plantId` hardcodeado en `fact_shoplogix_turnos/estados` (afectaba 781/1582 filas con Yal en temporada). El resto del trabajo (modelo, medidas DAX, página nueva, publish) fue en Power BI Desktop directamente (fuera de este repo) vía sesión de computer-use: relaciones dims↔facts + `dim_fecha`, medidas `P0 %`/`Disponibilidad %`/`Averia Macro Horas`/`Piezas Grader`, página "Análisis de Turno" con 4 KPIs + Pareto P0 + mix calibres + Pareto averías Shoplogix (filtrado `esAveria=1`, excluye Planned Downtime). Publicado y verificado en vivo en app.powerbi.com.
- Archivos: `scripts/powerbi/export-powerbi-datasets.js` (+71). Detalle completo (medidas, relaciones, gotchas del publish) en memoria de Claude `project_correo_empresa_m365_orelcain.md`.
- Verificación: export corrido contra Firestore real (10 CSVs OK). Publish a Power BI Service confirmado vía navegador (timestamp + página visible con datos).
- Estado: HECHO — PR #252 mergeado, `.pbix` publicado.
- Sigue (no bloqueante): slicer de fecha en la página, medidas MTTR/MTBF, filtro Planned Downtime a nivel de página en vez de solo el gráfico de averías.

## 2026-07-19 - claude - Shoplogix: turnos EN CURSO se congelaban tras la 1ª escritura — PR #251 (URGENTE)

- Origen: Orel reporta que la PWA no muestra data de Yal Turno 2 con Shoplogix entregando hace +20 min. Diagnóstico con Firestore + logs de `shoplogixSyncWakeup`: el poller vivo y con datos frescos, pero cada poll saltea el turno por "congelado" — doc pegado en su 1ª escritura (16:23, 0 ciclos).
- Causa raíz: `isShiftAlreadyFrozen` compara `scheduledEnd` (wall-clock-as-UTC) contra `now`/`lastSyncAt` (UTC reales) → `closedForMs` inflado +4h (invierno) > gracia 2h → cualquier turno, incluso en curso, se congela apenas tiene una escritura. No se vio antes: freeze reciente (optimización writes) y sin turnos vivos con producción (Chonchi 0 ciclos desde 21-06; Yal arrancó temporada HOY). Días pasados se ven bien porque el re-sync retroactivo usa forceAll.
- Fix: convertir el cierre a UTC real (`+ chileUtcOffsetHours(syncedAt)`) antes del freeze check, en el call site de `syncDay`. Self-healing al desplegar (el próximo poll reescribe los turnos pegados del día; no hay pérdida de data).
- Archivos: `functions/shoplogix/sync.js` (+12/-2).
- Verificación: 71/71 tests del módulo shoplogix OK (frozenShift 15/15). Diagnóstico validado contra doc real `shoplogix/yal/shifts/2026-07-19_Turno 2` y logs de prod.
- Estado: HECHO — mergeado (squash, OK de Orel) 22:00Z, deploy functions verde 2m46s, y VERIFICADO en prod: wakeup 22:03Z reescribió `2026-07-19_Turno 2` (ciclos 581/592/448, frozenSkipped=0, paros reales CINTAS/FALTA MMPP). Vista en vivo revivida sin pérdida de data.

## 2026-07-19 - claude - Admin: botón "Actualizar Power BI" (export + refresh a demanda) — PR #250

- Hecho: página `/admin/powerbi-export` (patrón sync-telegram): la PWA deja la orden en el doc de control `powerbiExport/chonchi`; el agente del PC (`C:\Users\orelc\automation\agente_powerbi.py`, tarea "ANTARFOOD PowerBI Agente" c/15 min, YA creada y probada) corre el export de CSVs → OneDrive empresa y dispara el refresh del dataset `KPIs_Mantencion_Piloto` en Power BI Service (REST + token MSAL en caché, `powerbi_auth.py`). La página muestra heartbeat, estado, refreshOk, duración e historial (`corridas`, solo Admin SDK). También se commiteó `scripts/powerbi/export-powerbi-datasets.js` (corría en prod local pero estaba fuera de git).
- Archivos: `apps/pwa/src/services/powerbiExport.service.ts` (nuevo), `apps/pwa/src/pages/admin/PowerBIExportPage.tsx` (nuevo), `App.tsx`, `AdminPanelPage.tsx`, `firestore.rules` (bloque `powerbiExport/{plantId}` calcado de `telegramSync`), `scripts/powerbi/export-powerbi-datasets.js`.
- Verificación: tsc 0 + eslint 0 + build prod OK (worktree `D:\a\wt-powerbi-button`). Ciclo end-to-end probado con orden simulada vía Admin SDK: export real OK (31,4 s), refresh falla limpio con "Power BI requiere login" (esperado), doc + corrida escritos.
- Estado: HECHO — Danilo corrió el login device-code (token OK), PR #250 mergeado con su OK (squash 22:09Z), deploys PWA + rules verdes, y ciclo E2E verificado: orden→agente→export 33 s→refresh ViaApi **Completed** en Power BI Service (22:10:48→22:11:10). Doc de control: estado ok / refreshOk true.
- Sigue: solo el clic real de Orel en `/admin/powerbi-export` cuando quiera usarlo.

---

# Historial resumido (anterior al 2026-07-19)

Bloques temáticos. Cada uno resume varias entradas; el detalle está en git.

## 2026-07-04 → 2026-07-18 · ARIA, seguridad, turnos y sync de Telegram

- **ARIA Telegram nació casi completa en una sola tanda (04-jul)**: chat natural con voz, 6 fuentes
  de datos nuevas, brief matinal 7AM + a demanda, crear incidencias con confirmación, whitelist +
  memoria + cerrar incidencias + alertas DM, voz de respuesta + visión + gráficos, respuestas
  formateadas (markdown→HTML de Telegram), "ARIA aprende" (hechos globales + lagunas + fallback de
  modelos) y ARIA como pivote de la app (mapa de módulos con conciencia de rol).
- **ARIA + repuestos por foto (06 al 07-jul)**: visión con OCR, adjuntar foto a un repuesto del
  maestro, crear/vincular repuesto desde foto (match SAP + criterio LLM), modo lote de fotos, y
  memoria de contexto para entender "ese mismo repuesto".
- **ARIA chat de la PWA (08-jul)**: primera capacidad de ESCRITURA — crear/vincular repuesto y
  editar código de fabricante desde el chat in-app.
- **Modelos**: actualización por deprecaciones de Groq + un 3er proveedor de respaldo.
- **Seguridad**: cierre de lecturas anónimas (PR #146) y proveedor anónimo apagado; parche de
  echarts por CVE-2026-45249 (XSS).
- **Turnos**: Shoplogix pasa a ser la fuente de verdad de horarios (PWA + manejo de DST en functions).
- **Repuestos**: "Solicitar a bodega" cierra el círculo (entregar descuenta stock real) y los nombres
  comunes se editan desde el panel de detalle.
- **PWA**: recuperación robusta ante "Failed to fetch dynamically imported module" post-deploy, y fix
  del visor de imágenes que no se podía cerrar en móvil.
- **Sync Telegram→OneDrive**: controlado desde el panel admin (PWA ↔ agente del PC), con historial de
  corridas, multi-grupo y layout responsive.
- **Barrido autónomo (18-jul, Sonnet 5 en loop)**: 13 PRs de pendientes + diagnósticos + limpieza.

## 2026-06-17 → 2026-06-21 · Centro Técnico Documental, tableros y cierre de la normalización

- **CTD en 5 pasos**: expediente autosuficiente (#92+#93) → "programa vivo" (#94) → traer de Equipos
  y repasada de flujo (#95+#96) → gestión de activos v1 (#97) → órdenes de trabajo, Camino B (#98).
- **Tableros / Unifilares (NFPA 70B)**: levantamiento con Excel + formulario en la PWA, realineado de
  "módulo suelto" a parte del expediente del equipo, y reconciliación en PR #91.
- **Dependabot**: las 23 alertas resueltas (bumps + overrides).
- **Fase 5 de limpieza**: retirada de features legacy (`machines` / `plantAssets`) con sus scripts de
  borrado, barrido de código muerto, chatbot ARIA in-app apuntando al maestro unificado, y retiro de
  `/insumos` y de la pestaña Mapas.
- **Repuestos**: pulido (ubicación en la fila, composición por clase), mejoras de sidebar/buscador/
  favoritos (#78), rediseño de las tarjetas KPI de stock, carga rápida de stock+ubicación, cotejo
  Excel↔app con import único a bodega, y foco SAP por defecto en la pestaña Áreas.
- **Deploy a producción** (#77).

## 2026-06-12 · Arranque

Normalización del maestro de repuestos (Fases 0-6) + rework de UI + coordinación multi-agente.
Desde acá el flujo pasó a ser estricto: **todo por rama + PR**.

---

# Pendientes que vienen de atrás

Estos seguían abiertos cuando se compactó el historial (2026-07-30):

- **Tablero piloto sin levantar**: CCM motor `720004608` / bomba `720004607` — falta cargar su placa
  real. Viene arrastrándose desde el 20-jun.
- **~45 equipos sin `tipo`** asignado en el CTD.
- **`useAppVersion.reload()` duplica a mano** la limpieza de caches y service workers → candidato a
  usar `clearCachesAndServiceWorkers()` en vez de repetir la lógica.
- Opcional: revisar si la alerta de secret-scanning #1 de GitHub se puede cerrar, ahora que la key
  quedó restringida.
- Opcional: botones Confirmar/Cancelar dedicados para repuestos en el chat ARIA de la PWA (hoy es
  solo texto plano) + soporte de fotos.
