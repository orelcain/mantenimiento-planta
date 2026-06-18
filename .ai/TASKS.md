# TASKS — backlog y tablero de reclamo

Antes de trabajar una tarea, cámbiala a `EN CURSO — <agente>` y commitea ese cambio
(así los demás agentes no la toman). Estados: TODO · EN CURSO · EN REVISIÓN · HECHO.
No tomes una tarea que ya está EN CURSO por otro.

## En curso

(ninguna)

## TODO — repuestos (app viva)

- [ ] **Solicitar a bodega end-to-end** — validar/cablear el flujo de pedido desde la ficha sobre el modelo nuevo (la acción ya existe en `RepuestoDetailPanel`). Dueño: —
- [x] **Chatbot ARIA in-app → maestro** — `fetchRepuestosSummary` reescrito: lee `repuestos` (maestro) + `hierarchy` (equipos) + `bodega` (stock), con detección de equipo, fuzzy+sinónimos y fallback global. Ahora abarca insumos/herramientas/químicos + N:M. Verificado con `scripts/normalizacion/98-verify-chatbot-maestro.js`. (claude, 2026-06-17 — ver WORKLOG)
- [ ] **Mapas (`CatalogoBases`) → maestro** — lee `plantAssets`; leer motores/bombas desde `repuestos` (clase motor/bomba). Dueño: —
- [ ] **Stats del header** — separan poco repuestos vs insumos; mostrar por tier/clase. Dueño: —
- [x] **Fase 5 — código muerto (parte 1)** — 23 archivos legacy borrados (Dashboard legacy + cluster machines/* + lectores legacy huérfanos + 2 sin commitear). tsc+eslint limpios. (claude, 2026-06-17 — ver WORKLOG)
- [ ] **Fase 5 — borrado de colecciones (BLOQUEADO, orden estricto)** — NO se puede borrar `machines`/`plantAssets`/`insumos` mientras haya lectores vivos. Estado de bloqueos: `machines` ← ya NO lo lee el chatbot (migrado ✅) ni `aria/tools/repuestos.ts` (usa cache del maestro); SOLO queda `useMachines` vía `MachineProvider` (raíz App.tsx) + `CategoryManager` (SettingsPage) → migrar/retirar eso. `plantAssets` ← `CatalogoBases` (Mapas) + `PanelCapasYZonas` (editor) → leer del maestro (clase motor/bomba). `insumos` ← página `/insumos` (ruteada+enlazada) → decisión de producto (retirar o repuntar al maestro). Recién con los 3 liberados: backup + dry-run + borrar `machines`/`plantAssets`/`insumos`/subcolecciones huérfanas/`repuestosBaader200` + barrer 2º nivel de código muerto. Dueño: —
- [ ] **Sub-repuestos en la ficha** (`parentMaterialId`, aún sin datos). Dueño: —

## Backlog general / futuro

- [ ] ARIA local (Ollama): definir cómo consulta el maestro (export Firestore o API solo-lectura).
- [ ] Puente de datos curado para ARIA (sin duplicar la fuente de verdad).

## Hecho (reciente)

- [x] Normalización repuestos Fases 0–6 (maestro SAP) + rework UI incrementos 1–7. (claude, 2026-06-12 — ver WORKLOG)
