# TASKS — backlog y tablero de reclamo

Antes de trabajar una tarea, cámbiala a `EN CURSO — <agente>` y commitea ese cambio
(así los demás agentes no la toman). Estados: TODO · EN CURSO · EN REVISIÓN · HECHO.
No tomes una tarea que ya está EN CURSO por otro.

## En curso

(ninguna)

## TODO — repuestos (app viva)

- [ ] **Solicitar a bodega end-to-end** — validar/cablear el flujo de pedido desde la ficha sobre el modelo nuevo (la acción ya existe en `RepuestoDetailPanel`). Dueño: —
- [ ] **Chatbot ARIA in-app → maestro** — `apps/pwa/src/services/chatbot.ts` hoy itera `machines/*/repuestos` (datos viejos); apuntarlo a la colección `repuestos`. Dueño: —
- [ ] **Mapas (`CatalogoBases`) → maestro** — lee `plantAssets`; leer motores/bombas desde `repuestos` (clase motor/bomba). Dueño: —
- [ ] **Stats del header** — separan poco repuestos vs insumos; mostrar por tier/clase. Dueño: —
- [ ] **Fase 5 — limpieza** (con backup + dry-run): borrar `machines`, `plantAssets`, `insumos`, subcolecciones huérfanas, `repuestosBaader200`; y código muerto (`useInsumosSearch`, `InsumoDetailPanel`, `types/insumos`, página `/insumos`, `Dashboard.tsx` legacy). Dueño: —
- [ ] **Sub-repuestos en la ficha** (`parentMaterialId`, aún sin datos). Dueño: —

## Backlog general / futuro

- [ ] ARIA local (Ollama): definir cómo consulta el maestro (export Firestore o API solo-lectura).
- [ ] Puente de datos curado para ARIA (sin duplicar la fuente de verdad).

## Hecho (reciente)

- [x] Normalización repuestos Fases 0–6 (maestro SAP) + rework UI incrementos 1–7. (claude, 2026-06-12 — ver WORKLOG)
