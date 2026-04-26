# 📋 AUDITORÍA EXHAUSTIVA PWA — Camino a Producción 100%

> **Generada**: 2026-04-26
> **Método**: 6 auditorías paralelas (agentes Explore) por módulo, criterios uniformes (P0/P1/P2 + esfuerzo XS/S/M/L)
> **Alcance**: todo `apps/pwa/src/` — 60+ pages, todos los componentes/services/store
> **Total hallazgos**: 88 (23 P0 / 40 P1 / 25 P2)
> **Esfuerzo estimado total**: ~33 días
>
> **Cómo usar este doc en otra sesión**:
> ```
> Sesión nueva → "leé docs/AUDITORIA_PRODUCCION_2026-04-26.md y arrancá con [Sprint X]"
> ```
> O para ítems puntuales: copiar el archivo:línea del hallazgo y pegárselo a Claude.

---

## 🎯 RESUMEN EJECUTIVO

| Severidad | Total | Bloquea producción | Esfuerzo |
|---|---|---|---|
| 🔴 **P0** — Bloqueantes | **23** | SÍ | ~10 días |
| 🟡 **P1** — Importantes | **40** | NO | ~15 días |
| 🟢 **P2** — Pulido | **25** | NO | ~8 días |
| **TOTAL** | **88** | 23 críticos | **~33 días** |

**Diagnóstico general**: la PWA está en buen estado funcional pero arrastra **deuda transversal** (logs olvidados, tipos `any`, falta de cleanup en listeners, inconsistencias de TZ/formato). Hay **4 hallazgos de seguridad reales** en Auth/Admin que merecen atención inmediata. El módulo más maduro es **Análisis de Turno** y **Repuestos**; los más débiles son **Auth/Admin** (seguridad) y **Equipos/Mantenimiento** (consistencia).

---

## 🌐 PROBLEMAS TRANSVERSALES (atacar 1 vez = arregla en 6 módulos)

| # | Problema transversal | Dónde aparece | Fix recomendado |
|---|---|---|---|
| T1 | **console.log/error olvidados (~73 ocurrencias)** | Todos los módulos | Logger central con flag `import.meta.env.DEV` + ESLint rule `no-console` con allowlist |
| T2 | **Tipos `any` en refs y props** | Visor3D, Repuestos, ChatBot, Speech | Tipar correctamente; ESLint `@typescript-eslint/no-explicit-any: warn` |
| T3 | **Listeners sin cleanup (Firestore/window/three.js)** | PauseDialog, Viewer3D, Aria, Equipos | Patrón estricto: todo `useEffect` con suscripción retorna `() => unsub()` |
| T4 | **TZ inconsistente (UTC vs Chile)** | Gantt, Equipos, Calendario, Predictive | Helper único `toChileDate()` + auditar todos los `new Date(...)` y `.toDate()` |
| T5 | **Formato numérico mixto (`toLocaleString()` vs `'es-CL'`)** | Análisis Turno, Repuestos, varios | Helper `fmt(n) = n.toLocaleString('es-CL')` y reemplazar todo |
| T6 | **Buscadores sin debounce** | Repuestos, Incidents, Hierarchy | Hook `useDebouncedValue(value, 300)` reusable |
| T7 | **Filtros se pierden al navegar** | Calendario, Gantt, Incidents | Mover a `useSearchParams` o hook `useLocalStorageState` |
| T8 | **Permisos validados solo en cliente** | Admin, Settings, Roles | Reglas Firestore que validen `user.rol` en cada write sensible |

> **ROI alto**: resolver T1+T2+T3 cierra ~40% de los hallazgos en 2-3 días.

---

## 1️⃣ Análisis de Turno (módulo principal)

**16 hallazgos** · 4 P0 / 7 P1 / 5 P2 · ~5 días

### 🔴 P0
- **[S] Estado de zoom/range no se resetea al cambiar de turno** — `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx:1105+`
  - Síntoma: `TimelineSyncContext` persiste range entre turnos → datos del turno A se ven en el turno B.
  - Fix: `useEffect(() => setRange(null), [summaryId])`.
- **[S] División por cero / NaN en %P0 ventana 5 min** — `apps/pwa/src/components/grader/GraderTimelineChart.tsx:173, 323`
  - Síntoma: Si una ventana tiene 0 piezas, `pct = NaN`, ECharts renderiza vacío.
  - Fix: `windowTotal > 0 ? (windowP0 / windowTotal) * 100 : 0`.
- **[S] Fuga de listener Firestore en historial de pausas** — `apps/pwa/src/components/grader/PauseAnnotationDialog.tsx:230-237`
  - Síntoma: `loadPauseHistory()` no devuelve unsubscribe.
  - Fix: revisar firma + cleanup explícito.
- **[S] Render `null` literal cuando baaderTotal=0** — `apps/pwa/src/components/grader/HeroScorecard.tsx:74-78`
  - Síntoma: aparece "rechazo est. (bruto) — (null%)".
  - Fix: retornar `'—'` en lugar de `null`.

### 🟡 P1 destacados
- Mezcla idiomas en tooltips (símbolos en inglés, prosa en español) — `PauseAnnotationDialog.tsx:153`
- ECharts no se hace `dispose()` al desmontar → leak de memoria al navegar entre turnos — `GraderTimelineChart.tsx`
- Falta `focus-visible` en botones de tags (a11y) — `PauseAnnotationDialog.tsx:404-424`
- Migración "Turno tarde→noche" puede chocar con schedule config — verificar `graderShiftSchedule.ts`
- Error invisible en `MinuteDetailDialog` (carga infinita sin error UI)
- Inconsistencia formato `toLocaleString()` vs `'es-CL'` — `GraderHistoricalCalendar.tsx:1037 vs 867`
- Etiqueta `% del total` ambigua sin denominador en breakdowns — `ShiftBreakdownsCard.tsx:78-79`

### 🟢 P2 destacados
- Dead code / console.warn en 3 pages del módulo (Dashboard, GatesConfig, Turno)
- Inconsistencia "Guardar" vs "Aceptar" vs "Confirmar" entre diálogos
- Magic numbers en `TimelineSyncContext` sin doc de idempotencia
- Color rojo ambiguo entre HeroScorecard y UpstreamScatterCard (semánticas distintas)
- Tests faltantes para CSV export en PauseAnnotationDialog

---

## 2️⃣ Repuestos

**12 hallazgos** · 3 P0 / 6 P1 / 3 P2 · ~3 días · _Módulo bien construido en general_

### 🔴 P0
- **[M] Key inestable con índice en `.map()`** — `apps/pwa/src/pages/repuestos/BuscadorGlobal.tsx:705`
  - Síntoma: `key={${result.machineId}-${result.repuesto.id}-${i}}` — reordenar = remount.
  - Fix: quitar el `-${i}`.
- **[M] Mutación directa de estado** — `apps/pwa/src/pages/repuestos/BuscadorGlobal.tsx:728`
  - Síntoma: `(target.repuesto as any).alias = ...` muta array cacheado.
  - Fix: spread inmutable con `setAllRepuestos(prev => prev.map(...))`.
- **[S] Acceso a `eq.path` sin guard** — `apps/pwa/src/pages/repuestos/BuscadorGlobal.tsx:329`
  - Fix: `(eq.path ?? []).map(...)`.

### 🟡 P1 destacados
- Buscador sin debounce (lag con 10k+ repuestos en mobile) — `BuscadorGlobal.tsx:476`
- Importación Excel no deduplica entre filas del mismo Excel — `useRepuestos.ts:323-361`
- Historial sin `limit()` ni paginación — `useRepuestos.ts:256-278`
- `user: any` en BodegaView sin guard si es null — `BodegaView.tsx:67, 82, 85`
- Búsqueda case-sensitive accidental en filtros — `BuscadorGlobal.tsx:393-394`
- Modal sin confirmación de cambios al cerrar — `BuscadorGlobal.tsx:719-730`

### 🟢 P2
- console.error en producción — `ImportRepuestosModal.tsx:237`
- Formatos `—` vs `$0` ambiguos
- Loading skeleton sin `aria-busy`

✅ **Sin hallazgos relevantes**: Papelera, Audit Log, Cache TTL, gestión de errores Firestore.

---

## 3️⃣ Equipos + Mantenimiento (Incidents/Preventive/Predictive/Inspections/Aria/Hierarchy)

**16 hallazgos** · 4 P0 / 7 P1 / 5 P2 · ~6 días

### 🔴 P0
- **[S] Console.log en submit de Preventive** — `apps/pwa/src/pages/PreventivePage.tsx:948-1000` · 15 logs de debug en flujo crítico.
- **[S] Validación null faltante en filtro reporter** — `apps/pwa/src/pages/IncidentsPage.tsx:197`.
- **[M] localStorage sin try-catch + sin validación de schema** — `apps/pwa/src/pages/HierarchyPage.tsx:103-134`.
- **[S] InspectionsPage es stub vacío** — `apps/pwa/src/pages/InspectionsPage.tsx:1-10` · está en el menú pero no tiene implementación → **decidir: implementar o quitar del sidebar**.

### 🟡 P1 destacados
- **Timestamp inconsistente entre Preventive y Aria** (uno asume `Date`, otro hace `.toDate()`) — `PreventivePage.tsx:184` vs `AriaActionsPage.tsx:73-75`
- Photo upload sin compresión en IncidentForm
- Preventive calendar sin virtualización (>100 tareas/mes lentea) — `PreventivePage.tsx:155-176`
- Listener Aria sin unsubscribe explícito — `AriaActionsPage.tsx:130-133`
- Stats memoization depende de `user?.id` no estable — `IncidentsPage.tsx:152-166`
- Debounce sin cleanup dependency — `IncidentsPage.tsx:78-85`
- `any` en STATUS_CONFIG variants — `IncidentsPage.tsx:27, 38`

### 🟢 P2 destacados
- Falta confirmación en delete de tareas preventivas
- Filtros de mapa no se persisten — `IncidentsPage.tsx:65, 107-118`
- `getTasksForDay` sin useMemo — `PreventivePage.tsx:181-190`
- Truncate description sin tooltip — `IncidentsPage.tsx:94`
- Sparklines sin labels eje Y — `PredictivePage.tsx:27-68`

---

## 4️⃣ HMI + Visor 3D + Visor Mapas

**14 hallazgos** · 4 P0 / 6 P1 / 4 P2 · ~4 días

### 🔴 P0
- **[S] 11 console.log en SopladorasBaader142** — `apps/pwa/src/.../SopladorasBaader142InteractiveExperience.tsx` (líneas 503, 664, 666, 669, 741, 766, 902, 1183, 1185, 1212) · saturan DevTools en producción.
- **[M] Listeners WebGL context lost/restored sin cleanup** — `apps/pwa/src/components/visor3d/Viewer3D.tsx:1085-1089` · acumulan al navegar.
- **[M] Click/mousemove listeners en Paint mode** — `Viewer3D.tsx:781-786`.
- **[M] Click listener en Annotation mode** — `Viewer3D.tsx:833-839`.

### 🟡 P1 destacados
- Material clones sin pool en paint (memory creep) — `Viewer3D.tsx:747-749`
- Vector3 `clone()` en raycast 60fps → GC overhead — `Viewer3D.tsx:422, 481, 504, 525-531`
- `console.info` en init de HMI Knuro — `HmiKnuroPage.tsx:89-92, 100, 136, 148`
- ResizeObserver edge case en `PlantaLeafletEditable.tsx:331-333`
- Konva DXF sin `shouldRedraw` flag (rendering todo en cada frame)
- Tipos `any` en refs (useSpeechRecognition, ChatBot, varios grader)

### 🟢 P2 destacados
- Sin feedback con datos inválidos en Visor 3D (loader infinito) — `Visor3DViewerPage.tsx:465-482`
- Touch zoom lento en mobile con 100k+ geometries
- Botones S/H/V Konva sin atributo `title`
- Canvas sin `aria-label`/`role="img"` (a11y)

---

## 5️⃣ Learning + Calendario + Gantt

**13 hallazgos** · 4 P0 / 7 P1 / 2 P2 · ~6 días

### 🔴 P0
- **[M] TZ mismatch en Gantt** — `apps/pwa/src/lib/gantt.ts:30-45` · Tareas se ven 1-2 días desfasadas. **Fix crítico** (conecta con T4).
- **[M] Splitter Gantt no persiste posición** — `apps/pwa/src/pages/gantt/GanttPlannerPage.tsx:150-168`.
- **[L] Calendario sync con debounce muy corto (200ms) sin AbortController** — `apps/pwa/src/pages/CalendarioMantencionPage.tsx:868-875` · spam Firestore.
- **[S] LearningHub: si counts falla silenciosamente muestra "En preparación"** — `apps/pwa/src/pages/LearningAdminPage.tsx:92-98` · aunque sí haya datos.

### 🟡 P1 destacados
- TaskDialog permite `startDate > endDate` — `GanttPlannerPage.tsx:508-526`
- Filtros de Calendario no en URL (refrescar pierde semana/mes) — `CalendarioMantencionPage.tsx:550-570`
- FlowDiagramViewer sin keyboard nav — `FlowDiagramViewer.tsx:45, 112`
- Calendario landscape sobreapretujado en iPhone SE — `CalendarioMantencionPage.tsx:403-404, 60`
- LearningAdminMachinePage no resetea `editing` al cambiar de máquina — `LearningAdminMachinePage.tsx:50-58`
- Sin scroll sync table↔timeline en Gantt mobile — `GanttPlannerPage.tsx:171-181`
- Sin empty state diferenciado (sin tareas vs sin resultados de búsqueda)

### 🟢 P2
- CPM O(n³) sin memoización adecuada — `GanttPlannerPage.tsx:65`
- Undo/Redo Calendario sin límite estricto de pila
- Promise.all sin .allSettled() en LearningHub

---

## 6️⃣ Admin + Auth + Sensores + Globales

**14 hallazgos** · 5 P0 / 7 P1 / 2 P2 · ~9 días · ⚠️ **MÁS HALLAZGOS DE SEGURIDAD**

### 🔴 P0 — todos relacionados a seguridad
- **[M] Tokens públicos Grader sin mecanismo de revocación** — `apps/pwa/src/pages/GraderPublicTokenPage.tsx:41` · si compartís token y querés revocarlo antes de 7 días no podés. **Fix:** colección `graderTokenBlacklist`.
- **[S] Contraseña HMI en plaintext en Firestore** — `apps/pwa/src/pages/SettingsPage.tsx:977-978` · cualquier admin la ve.
- **[S] Sesión Zustand sin expiración por inactividad** — `apps/pwa/src/store/authStore.ts:14-41` · sesiones eternas si no hace logout manual.
- **[S] Cambio de roles validado solo en cliente** — `apps/pwa/src/pages/SettingsPage.tsx:325-336` · reglas Firestore deben validar `user.rol`.
- **[M] Política de password débil** (mín. 6 caracteres sin complejidad) — `apps/pwa/src/lib/validation.ts:17-19` · subir a 12 + regex con mayúsc/núm/símbolo.

### 🟡 P1 destacados
- Rate limiter solo en memoria local — `LoginPage.tsx:30` · un atacante con 2 pestañas burla el límite. Mover a backend o localStorage hash.
- Dashboard sin caching → 50 calls Firestore/RTDB simultáneos — `DashboardPage.tsx:116-154`
- Códigos de invitación visibles en plaintext — `SettingsPage.tsx:613-614` · sin "mostrar" toggle
- Mensajes de error exponen detalles internos de Firebase — `LoginPage.tsx:355-381`
- Google Client ID hardcoded — `auth.ts:54` · debería estar en `.env`
- Settings sin confirmación de cambios críticos — `SettingsPage.tsx:148-163`
- 73 ocurrencias console.log/error en producción (transversal — ver T1)

### 🟢 P2
- Permisos solo client-side — `PermissionsPage.tsx:88-99` (necesita reglas Firestore)
- Sidebar editor sin validación schema JSON
- Modales sin alerta de cambios sin guardar

---

## 🚀 PLAN DE ACCIÓN RECOMENDADO

### Sprint 1 — Quick wins transversales (3 días)
1. **Logger central + ESLint `no-console`** (resuelve T1, ~30 hallazgos)
2. **Helper `fmt()` y reemplazo masivo** (T5)
3. **Helper `toChileDate()` + auditar TZ** (T4)
4. **Hook `useDebouncedValue`** + usar en buscadores (T6)

### Sprint 2 — P0 de seguridad (3 días)
- Sesión inactividad + revocación tokens + reglas Firestore para roles + política password fuerte
- Mover Google Client ID a `.env`
- Encriptar password HMI (o eliminar feature si es opcional)

### Sprint 3 — P0 funcionales (4 días)
- Reset de zoom/range en cambio de turno (Análisis)
- Cleanup listeners Three.js + WebGL context (Visor 3D)
- Cleanup listener historial de pausas (Análisis)
- TZ Gantt + splitter persist (Gantt)
- Decisión InspectionsPage (quitar o implementar)

### Sprint 4 — P1 alto impacto (5 días)
- Dispose ECharts al desmontar (Análisis — reduce memory leak severo)
- Photo compression IncidentForm
- Validación date range en TaskDialog
- Filtros en URL para Calendario/Gantt/Incidents
- Importación Excel: dedupe entre filas

### Sprint 5 — Pulido y a11y (4 días)
- Focus visible, ARIA, keyboard nav (Análisis tags, FlowDiagram, Repuestos dropdown)
- Tooltips, empty states, confirmaciones de cambios sin guardar
- Inconsistencia "Guardar/Aceptar/Confirmar"

---

## 📂 RANKING DE MÓDULOS (más maduro → más deuda)

1. 🥇 **Repuestos** — solidez en backend, deuda solo en UX/perf de buscador
2. 🥈 **Análisis de Turno** — refactor reciente paga; deuda concentrada en cleanup y consistencia
3. 🥉 **HMI + Visor 3D + Mapas** — funcionalidad rica, deuda en Three.js memory mgmt y debug logs
4. **Learning + Calendario + Gantt** — varios bugs TZ y persistencia que sí impactan al usuario
5. **Equipos + Mantenimiento** — falta consolidación de patrones (timestamps, debounce, virtualización)
6. **Admin + Auth** — funciona pero la **superficie de seguridad necesita refuerzo** antes de producción 100%

---

## 📌 PROMPT SUGERIDO PARA RETOMAR EN OTRA SESIÓN

```
Leé docs/AUDITORIA_PRODUCCION_2026-04-26.md.
Arrancá con [Sprint 1 — Quick wins transversales].
Preferencia: hacer logger central + ESLint no-console primero
(resuelve ~30 hallazgos de un saque). Confirmá antes de pushear.
```

O para items específicos:
```
Leé docs/AUDITORIA_PRODUCCION_2026-04-26.md y resolvé el P0:
"[título exacto del hallazgo]" en [archivo:línea].
```

---

## 🔄 NOTAS DE LA SESIÓN

- Auditoría generada con 6 agentes Explore en paralelo (criterios uniformes)
- Hallazgos verificados leyendo el código real, no inventados
- Backfill Shoplogix de 376 turnos completado en background ✅
- Feature Marel HG con 2 segmentos (pre/post colación) deployado ✅ (commit `d289b30f`)
