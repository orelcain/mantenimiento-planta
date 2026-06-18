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

## 2026-06-17 · claude · Test funcional en vivo + retiro de pestaña Mapas

- Test funcional (preview logueado, código de D: confirmado servido): búsqueda Áreas ("sumitomo"→4 N:M), ficha (Dónde se usa + Solicitar), **Solicitar end-to-end** (crear→reglas OK→lista→avance Pendiente→Aprobada; dato de prueba borrado con script admin), Bodega (188/3777 + alertas), **chatbot ARIA** ("guantes"→29 insumos con SAP, antes invisibles). Sin errores de consola.
- Decisión de Orel: **retirar la pestaña Mapas**. Datos (solo-lectura): `plantAssets`=134 (61 copias `asset-720*` vacías), **0 marcadores en mapas** (el feature nunca se usó), specs/fotos ya migrados al maestro; `plantMaps`=3 (Chonchi/Yal/Acopio). → No es duplicado borrable: era el backing del editor de pines, pero está vacío.
- Hecho: `RepuestosPage` ahora 2 pestañas (Áreas + Bodega; quitado tab/type/import/contenido `bases` y el icono `Map`). Borrados `pages/repuestos/CatalogoBases.tsx`, `components/repuestos/MapasViewer.tsx`, `components/repuestos/AssetDetailModal.tsx`, `hooks/repuestos/usePlantMaps.ts` (huérfanos tras quitar la pestaña).
- IMPORTANTE: `plantAssets` AÚN lo lee `MapaPlantaPage`/`components/map/leaflet-editable/PanelCapasYZonas.tsx` (feature SEPARADA del mapa leaflet). Retirar la pestaña Mapas NO libera la colección; su borrado depende de decidir qué pasa con esa otra página. `usePlantAssets` se conserva por eso.
- Verificación: `tsc`=0, `eslint`=0. En preview (HMR + reload): módulo carga, 2 pestañas, búsqueda "baader rodamiento"→25 resultados correctos. Nota: Vite deja errores de consola "Failed to reload CatalogoBases/MapasViewer/AssetDetailModal" (recuerda los archivos borrados) + un "Map requires new" transitorio del que React se recuperó — ambos se limpian al reiniciar el dev server, no son runtime reales.
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosPage.tsx` (M) + 4 borrados.
- Estado: HECHO. Sigue: decidir `/insumos`; y por separado, qué hacer con `MapaPlantaPage` (último lector de `plantAssets`).

## 2026-06-17 · claude · Chatbot ARIA in-app → maestro unificado

- Hecho: reescrito `fetchRepuestosSummary` en `apps/pwa/src/services/chatbot.ts`. Antes iteraba `machines` + `machines/*/repuestos` (datos pre-migración: sin insumos/herramientas/químicos, sin N:M). Ahora hace 3 queries planas en paralelo: `repuestos` (maestro), `hierarchy` (nombres de equipo + nodos tipo equipo), `bodega` (stock+ubicación por SAP). Conserva detección de equipo (sobre nodos `hierarchy`, ignora COMPONENT_WORDS), fuzzy + sinónimos (helpers in-file reusados). Salida con clase, stock real de bodega, ubicación, equipos N:M y marca de despiece (sin-SAP no pedible). Quitado import muerto `Machine, Repuesto`.
- Mejora de robustez: cuando la búsqueda con scope de equipo da 0 (la detección codiciosa consume términos que también son descriptores del material — "aceite hidraulico", "sello mecanico", porque los nombres de equipos de planta contienen esas palabras), cae a **búsqueda flexible GLOBAL** rankeada por nº de términos que matchean + stock. Antes esos casos devolvían 0.
- Verificación: `tsc --noEmit` = 0, `eslint src/services/chatbot.ts` = 0. Capa de datos verificada con `scripts/normalizacion/98-verify-chatbot-maestro.js` (solo-lectura, replica el matching sobre Firestore real): "sumitomo"→4 motorreductores; "guantes"→insumos (antes invisibles); "rodamiento"→132 (repuesto+herramienta); "baader casquillo"→135 (SAP+despiece); "aceite hidraulico"→ACEITE HD HIDRAULICO 32 (químico) vía fallback; "sello mecanico"→SELLO MECANICO 32MM vía fallback. NO verificado en navegador (el preview corre desde OneDrive, no desde D:; requiere login Google).
- Nota: `aria/tools/repuestos.ts` (tool del orquestador) ya leía del cache del maestro (`getGlobalRepuestosCache`), su comentario de cabecera está obsoleto pero el código es correcto. Detectado mojibake en datos fuente (ej. "elÃ¡stico" = doble-encoding UTF-8 en Firestore) — problema de datos preexistente, afecta búsqueda, anotar para limpieza futura.
- Archivos: `apps/pwa/src/services/chatbot.ts` (M), `scripts/normalizacion/98-verify-chatbot-maestro.js` (nuevo).
- Estado: HECHO. Con esto `machines` ya no tiene lectores de datos en el chatbot/tools; solo queda `useMachines`/MachineProvider/CategoryManager antes de poder borrar la colección.
- Sigue: (Fase 5) migrar/retirar MachineProvider+CategoryManager → libera `machines`; Mapas+editor → libera `plantAssets`; decidir `/insumos`.

## 2026-06-17 · claude · Fase 5 limpieza — borrado de código legacy muerto (parte 1)

- Hecho: eliminado código legacy muerto del módulo repuestos (era el primer paso seguro de Fase 5, verificable con tsc/eslint). 23 archivos borrados en cascada de huérfanos (cada nivel re-verificado con `tsc`): `pages/repuestos/Dashboard.tsx` (hub legacy, NO ruteado) + su export en `pages/index.ts`; cluster `EquipmentNavigator`/`MachineAccordionNav`/`DuplicatesModal` y sus deps únicas (`EquipmentCard`, `MachineManager`, `ManualSearchModal`, `MachineSelector`, `RelocateRepuestoModal`, `BulkRelocateModal`, `useDuplicateScanner`, `services/mergeRepuestos`); lectores legacy de `machines/*/repuestos` huérfanos (`useRepuestos`, `useRepuestosCounts`, `RepuestoDetailModal`, `LinkMachineModal`, `MachineHierarchySelector`, `AssetDetailPanel`, `MachineManualPanel`, `useEquipmentRepuestos`, `services/repuestos.ts`); + 2 huérfanos sin commitear (`useInsumosSearch.ts`, `InsumoDetailPanel.tsx`).
- Radiografía del maestro (script nuevo solo-lectura `scripts/normalizacion/99-stats-maestro.js`): 7.657 docs · 3.777 con SAP · 188 con stock en bodega (núcleo: los 188 tienen SAP **y** equipo) · solo 64 con foto real · clase: repuesto 5.773/insumo 1.494/refrig 154/quimico 127/herram 107/lubric 2.
- **HALLAZGO: el borrado de colecciones legacy está BLOQUEADO por lectores vivos** (la lista de "dead code" de la memoria estaba desactualizada). Mapa de bloqueos:
  - `machines` ← `services/chatbot.ts` (fetchRepuestosSummary, líneas ~1326/1402/1545/1568) + `useMachines` vía `MachineProvider` (raíz de App.tsx) y `CategoryManager` (SettingsPage). **Prerequisito: migrar chatbot al maestro + retirar/migrar MachineProvider/CategoryManager.**
  - `plantAssets` ← `usePlantAssets` usado por `CatalogoBases` (tab Mapas, vivo) y `PanelCapasYZonas` (editor de mapa, vivo). **Prerequisito: leer motores/bombas del maestro (clase motor/bomba).**
  - `insumos` ← página `/insumos` (`InsumosPage`, ruteada en App.tsx + enlazada en home móvil y sidebar). **Prerequisito: decisión de producto — retirar la página o repuntarla al maestro filtrado por clase.**
  - Nota: las rutas de Storage `machines/{id}/manuales|infografias|repuestos/...` en `useStorage`/`pdfCache`/`usePlantStorage` son de Storage, NO de Firestore — no bloquean el borrado de la colección.
- Archivos: 21 borrados trackeados + `pages/index.ts` (M) + `scripts/normalizacion/99-stats-maestro.js` (nuevo).
- Verificación: `npx tsc --noEmit` = 0 y `npx eslint src --quiet` = 0 tras cada nivel de borrado. UI en vivo NO verificada (la PWA exige login Google + vive en D:; pendiente que Orel confirme en preview que el módulo renderiza igual).
- Estado: HECHO (limpieza de código). Borrado de colecciones: PENDIENTE/BLOQUEADO (ver mapa).
- Sigue: orden correcto de Fase 5 = (1) chatbot→maestro, (2) Mapas/editor→maestro, (3) decidir `/insumos`; recién entonces backup + dry-run + borrado de `machines`/`plantAssets`/`insumos`/huérfanas. Segundo nivel de código muerto a barrer luego (CategoryManager/useMachines/MachineContext si quedan sin uso tras migrar).

## 2026-06-12 · claude · Normalización repuestos (Fases 0–6) + rework UI + coordinación

- Hecho: migración a maestro SAP único `repuestos` (~7.657 docs; insumos+repuestos+herramientas unificados). Jerarquía tipada (`tipoNodo`), `manuales` N:M, rescate de manuales/historial/tags. Rework UI: tier SAP-first, filtro de clase, badges, ficha con manuales heredados + "dónde se usa" N:M, flujos asignar-SAP y asignar-equipo, Bodega abre en "configurados". Eliminado panel duplicado de insumos. Montada esta carpeta `.ai/` de coordinación.
- Archivos: `scripts/normalizacion/00..09`, `apps/pwa/src/{types/repuestos.ts, hooks/repuestos/*, pages/repuestos/*, components/repuestos/RepuestoDetailPanel.tsx}`.
- Verificación: `tsc --noEmit` + `eslint` limpios en cada incremento; verificado en preview (búsqueda, ficha, manuales heredados, asignar-equipo, Bodega).
- Estado: datos HECHO; UI HECHO (incrementos 1–7). Trabajo directo en working tree (aún sin ramas/PR; los scripts de migración ya se aplicaron a Firestore).
- Sigue: ver `TASKS.md` (solicitar-a-bodega, chatbot al maestro, Mapas, Fase 5 limpieza). De aquí en adelante, todo por rama + PR (flujo estricto).
