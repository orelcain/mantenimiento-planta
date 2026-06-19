# TASKS — backlog y tablero de reclamo

Antes de trabajar una tarea, cámbiala a `EN CURSO — <agente>` y commitea ese cambio
(así los demás agentes no la toman). Estados: TODO · EN CURSO · EN REVISIÓN · HECHO.
No tomes una tarea que ya está EN CURSO por otro.

## En curso

(ninguna)

## TODO — repuestos (app viva)

- [ ] **Solicitar a bodega end-to-end** — validar/cablear el flujo de pedido desde la ficha sobre el modelo nuevo (la acción ya existe en `RepuestoDetailPanel`). Dueño: —
- [x] **Chatbot ARIA in-app → maestro** — `fetchRepuestosSummary` reescrito: lee `repuestos` (maestro) + `hierarchy` (equipos) + `bodega` (stock), con detección de equipo, fuzzy+sinónimos y fallback global. Ahora abarca insumos/herramientas/químicos + N:M. Verificado con `scripts/normalizacion/98-verify-chatbot-maestro.js`. (claude, 2026-06-17 — ver WORKLOG)
- [x] **Mapas (`CatalogoBases`) → RETIRADA** (decisión de Orel 2026-06-17) — el "feature" de ubicar motores/bombas en planos tenía 3 planos y **0 pines colocados** (nunca se usó); specs/fotos ya están en el maestro. Se quitó la pestaña (módulo ahora = Áreas + Bodega) y se borraron `CatalogoBases`, `MapasViewer`, `AssetDetailModal`, `usePlantMaps`. NOTA: `plantAssets` AÚN lo lee `MapaPlantaPage`/`PanelCapasYZonas` (el mapa leaflet, feature SEPARADA) → no se libera la colección con esto; su borrado depende de esa otra página. (claude, 2026-06-17)
- [x] **Página `/insumos` → RETIRADA** (decisión de Orel 2026-06-18) — leía la colección legacy `insumos` (respaldo congelado) y permitía editar stock que el maestro no ve; datos: 3552 insumos, **0 con metadata de conteo** (el editor nunca se usó), ya unificados en el maestro. Quitada ruta + lazy import (App.tsx), enlaces (MobileHomeGrid, SidebarEditorPage), borrados `InsumosPage`, `InsumoDetailModal`, `types/insumos`. **`insumos` ya NO tiene lectores vivos → libre para borrar en Fase 5** (con backup). (claude, 2026-06-18)
- [x] **Foco SAP en Áreas** (2026-06-18) — interruptor "Solo con SAP" (default ON) que oculta el despiece sin SAP y avisa cuántos oculta ("+N despiece"); KPI grande pasó de "Repuestos totales" (mezclado) a "Repuestos con SAP". Implementa la visión "enfocarse en los con SAP". Verificado en preview. (claude)
- [x] **Fase 5 — código muerto (parte 1)** — 23 archivos legacy borrados (Dashboard legacy + cluster machines/* + lectores legacy huérfanos + 2 sin commitear). tsc+eslint limpios. (claude, 2026-06-17 — ver WORKLOG)
- [ ] **Fase 5 — borrado de colecciones (BLOQUEADO, orden estricto)** — NO se puede borrar `machines`/`plantAssets`/`insumos` mientras haya lectores vivos. Estado de bloqueos: `insumos` ← **LIBRE ✅** (página `/insumos` retirada; 0 lectores vivos) → listo para borrar con backup. `machines` ← ya NO lo lee el chatbot (migrado ✅) ni `aria/tools/repuestos.ts` (usa cache del maestro); SOLO queda `useMachines` vía `MachineProvider` (raíz App.tsx) + `CategoryManager` (SettingsPage) → migrar/retirar eso. `plantAssets` ← pestaña Mapas retirada ✅ pero AÚN lo lee `MapaPlantaPage`/`PanelCapasYZonas` (mapa leaflet, feature aparte) → decidir esa página. Recién con los 3 liberados: backup + dry-run + borrar `machines`/`plantAssets`/`insumos`/subcolecciones huérfanas/`repuestosBaader200` + barrer 2º nivel de código muerto. Dueño: —
- [ ] **Sub-repuestos en la ficha** (`parentMaterialId`, aún sin datos). Dueño: —

## Backlog general / futuro

- [ ] ARIA local (Ollama): definir cómo consulta el maestro (export Firestore o API solo-lectura).
- [ ] Puente de datos curado para ARIA (sin duplicar la fuente de verdad).

## Hecho (reciente)

- [x] Normalización repuestos Fases 0–6 (maestro SAP) + rework UI incrementos 1–7. (claude, 2026-06-12 — ver WORKLOG)
