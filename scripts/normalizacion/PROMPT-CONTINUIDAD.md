# Prompt de continuidad — Normalización del módulo de repuestos

> Copia y pega TODO lo de abajo como primer mensaje de la sesión nueva.

---

Retomamos la **normalización del modelo de datos del módulo de repuestos** en la PWA de mantenimiento.

**Proyecto:** `D:\a\APP leventamiento de insidencias en planta\apps\pwa` (Firebase `mantenimiento-planta-771a3`).
**Plan completo por fases:** `C:\Users\orelc\.claude\plans\agile-forging-lerdorf.md`
**Mapa de reconciliación (terminado):** `scripts/normalizacion/reconciliation-map.json`
**Memorias del proyecto:** ver `[[normalizacion-modelo-repuestos]]` y `[[firebase-config-pwa-mantenimiento]]`.

## El problema que resolvemos
Había 3 "verdades" compitiendo (colecciones `machines`, `plantAssets` y `hierarchy`) y los repuestos colgaban del lugar equivocado, lo que rompía la búsqueda. Vamos a dejar **una sola verdad** sobre la jerarquía SAP.

## Modelo acordado (reglas firmes del usuario)
1. La colección `hierarchy` (lista SAP) es **fija e intocable**. **Nunca crear equipos nuevos.**
2. **Equipo** = SOLO nodo de `hierarchy` con código de equipo (`720004…`). Incluye motorreductores/bombas que ya son nodos (la *posición*).
3. **Repuesto** = material SAP (`3300…`) colgado del nodo-equipo. Un motor/bomba físico (ej. Sumitomo) es repuesto, NO equipo. Puede tener sub-repuestos (`parentRepuestoId`).
4. **Repuestos compartidos (N:M):** un código SAP = un repuesto = un stock, **asociado a TODAS las instancias del mismo modelo** donde sirve (ej. los 1803 de "Baader 142" → las 6 evisceradoras). No se duplica.
5. `machines` (36) y `plantAssets` (134) son capas paralelas **a eliminar** tras migrar. `insumos` (3431) se mantiene aparte.

## Estado actual: Fase 0 COMPLETA ✅
- `serviceAccountKey.json` ya está en la raíz del repo (scripts admin funcionan).
- Backup completo en `backups/normalizacion-2026-06-10T23-53-21/`.
- Auditoría corrida. Hallazgo: de 36 máquinas, solo **12 tienen repuestos** (las otras 24 son ruido, 0 rep → eliminar).
- **Mapa de reconciliación TERMINADO** (las 12 máquinas → nodos SAP) en `scripts/normalizacion/reconciliation-map.json`. Resumen:
  - Baader 142 (1803) → 6 evisceradoras (N1/N2/N3 Chonchi+Yal)
  - Baader 200 (1515) → 720004417
  - GEA V2 (572) → 720012997 · Marel Filete (257) → 720012998
  - Knuro (156) → 6 Knuro · Marel Eviscerado (127) + Marel HG (26) → 720004435
  - Grader (99) → 720004462 · Videojet (70) → nodo "Impresora Videojet" (sin código)
  - Garibaldi (37) → 3 enzunchadoras (720004592/593, 720003516) · Detector Metales (33) → 720012954 · Fishken (14) → nodo "Cinta Fishken" (sin código)
  - Pendientes triviales: "Bomba caseta agua mar 40/26" (1 rep), "Cinta Elevadora 1 Cuello Cisnes" (1 rep).

## Próximos pasos (en orden)
1. **Decidir el almacenamiento N:M** antes de migrar: lo más limpio es una **colección plana `repuestos` por código SAP** con `equipos: [nodeIds]` (como ya funcionan `insumos` y `bodega`). Mostrar al usuario un dry-run de cómo queda con un ejemplo (Baader 142) antes de tocar nada.
2. **Fase 1 — Tipar la jerarquía** (seguro, aditivo): script `02-tag-nodes.js` que setea `tipoNodo: 'area'|'equipo'` en cada nodo (derivado del código). Formalizar `isAreaNode`/`isEquipmentNode` en `apps/pwa/src/hooks/useHierarchyAreaTree.ts`.
3. **Fase 2 — `plantAssets` → repuestos** (no nodos): script `03-plantassets-to-repuestos.js` (dry-run primero). Los 134 motores/bombas pasan a ser repuestos con marca/modelo/foto, asociados a su nodo-equipo. NO crear nodos.
4. **Fase 3 — Reconciliar `machines`**: script `04-reassign-repuestos.js` (dry-run primero) que recuelga los 4709 repuestos según `reconciliation-map.json`, aplicando el modelo N:M (cada repuesto → lista de instancias).
5. **Fase 4 — UI** sobre la jerarquía única (navegar área→equipo→sub-equipo; quitar sección "Motores y bombas"; búsqueda con badges Equipo/Repuesto/Insumo; mostrar sub-repuestos).
6. **Fase 5 — Limpieza**: eliminar `machines`, `plantAssets`, código muerto (`usePlantAssets`, etc.).

**Regla de oro:** cada fase con cambios de datos va con **backup ya hecho + dry-run + aprobación del usuario** antes de escribir. `tsc --noEmit` + `eslint` limpios en cada fase con código.

## Cómo arrancar la sesión
- Preview: usar el config "Mantenimiento Planta (PWA)" (Vite en `localhost:5173/mantenimiento-planta/`). Al reiniciar se pierde la sesión Firebase → volver a iniciar sesión. Con el `.env.local` actual ya funciona login Google + asistente ARIA.
- Scripts admin: corren desde la raíz del repo con `node scripts/normalizacion/<script>.js` (usan `serviceAccountKey.json`).

Empieza confirmando conmigo el punto 1 (almacenamiento N:M) con un ejemplo, y seguimos.
