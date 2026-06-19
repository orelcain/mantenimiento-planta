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

## 2026-06-19 · claude · DEPLOY a producción (PR #77 → main)

- Mergeado `chore/ai-coordination` → `main` vía PR #77 (build CI pass; mergeable CLEAN). Sincronizada main (2 commits: daily-sync version.ts + nanobanana) antes del merge. `pnpm build` local = exit 0.
- Deploy disparado y **COMPLETADO con éxito**: workflow "Deploy PWA" = success, "Deploy Firestore Rules" = success. Todo el trabajo de la sesión está LIVE: chatbot→maestro, foco SAP, tarjetas KPI pro, carga rápida, retiro de Mapas/insumos/import-UI, limpieza de ~26 archivos legacy. La bodega ya estaba poblada (import a Firestore, independiente del deploy de código).
- Pendientes abiertos (no bloquean): 12 SAP del Excel fuera del maestro (5 son materiales reales: AUTOMATICO 2P 6A, FOCO LED 100W, CUCHILLO FROSTS 351P, PATA REGULADORA D65, EMPAQUETADURA SILICONA); 22 vulnerabilidades dependabot en el repo; Fase 5 deletes de colecciones legacy (insumos ya libre; machines/plantAssets aún con lectores).
- Estado: DEPLOY HECHO. Módulo de repuestos en producción con datos reales.

## 2026-06-19 · claude · Cotejo Excel↔app + IMPORT único de stock/ubicación a bodega

- Cotejo máquina-por-máquina (`scripts/cotejo-excel-maestro.js`, solo-lectura) de `INVENTARIO/Maestro_Repuestos_Completo_v3.xlsx` vs maestro: **100% de los SAP del Excel están en la app** (Baader142→EVISCERADORA BAADER 142, Baader200→B200, Grader→GRADER, Garibaldi→ENZUNCHADORA N1, Knuro→KNURO N1, M.Eviscerado→**MAREL HG**, M.Filete→MAREL FILETE, GEA→TERMOFORMADORA GEA, Fishken→CINTA FISHKEN; Det.Metales/Videojet sin SAP). Mapeo correcto. (Aclaración: MAREL HG = máquina de eviscerado Marel, distinta del GRADER; en un test previo confundí ambos.)
- HALLAZGO: el stock+ubicación SÍ existía en los Excel y NUNCA se había importado a `bodega` (estaba vacía: 0 stock, 0 ubic). Fuente elegida: `STOCK ALMACENES.xlsx` (centro AI04/Chonchi, actualizado 2026-06-19) hojas "inventario 2026" (SAP/cantidad/ubicación/equipo) + "Clasificacion" (ubicación fallback).
- IMPORT ÚNICO aplicado: `scripts/import-stock-bodega.js --write` (dry-run primero; backup de bodega en `backups/bodega-pre-import-*.json`). Resultado: **bodega 189 → 2.170 docs · 1.627 con stock · 1.938 con ubicación**. Solo SAP del maestro (13 fuera-de-maestro omitidos); idempotente; preserva min/unidad de los 186 ya configurados. Verificado en Firestore (BUJE INOX 3300133492 = stock 10, ubic C-31, = Excel) y EN VIVO en la app (ficha muestra DISPONIBLE 10 / UBICACIÓN C-31 / equipo GRADER; KPI "Stock disponible" pasó de 0 a 2.108 / 97%).
- HECHO (pedido por Orel): import ÚNICO → de aquí en más se gestiona en la app. **Retirada la opción de importar Excel de la UI**: borrado `pages/repuestos/ImportRepuestosModal.tsx` (era huérfano desde que se borró el Dashboard legacy; ya no estaba montado). El resto de usos de `xlsx` en src son exportaciones o la feature aparte de Análisis Grader — se conservan.
- Archivos: `scripts/cotejo-excel-maestro.js`, `scripts/import-stock-bodega.js` (nuevos). Datos: colección `bodega` poblada (no es git).
- Estado: cotejo + import HECHOS y verificados. Sigue: retirar UI de import Excel; opcional listar los 13 SAP fuera-de-maestro.

## 2026-06-18 · claude · Rediseño tarjetas KPI de stock (look profesional)

- Pedido de Orel: tarjetas de stock más profesionales. Rediseñado `KpiCard` en `RepuestosAreaHub`: de borde-izquierdo plano a tarjeta con **chip de ícono** (Package/PackageCheck/PackageMinus/PackageX) con tinte + ring por estado, número grande tracking-tight, label, hint, y gradiente sutil de fondo por tono (primary/emerald/amber/red). Mapa `KPI_TONE`. Las 4 tarjetas (Repuestos con SAP / Stock disponible / Stock bajo / Sin stock) pasan `icon`+`tone` en vez de `accent`+`bar`.
- Verificado en preview (build limpio, PLANTA CHONCHI): 753 con SAP / 187 sin stock, tarjetas con íconos y tintes correctos. tsc=0, eslint=0. (Hubo un TypeError `glow` TRANSITORIO de HMR por el rename intermedio; build limpio sin error.)
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`.
- Estado: HECHO. Pendiente opcional: aplicar el mismo estilo a la tarjeta de stock de la ficha (Disponible/Mín/Máx) para coherencia.

## 2026-06-18 · claude · Carga rápida de stock + ubicación (poblar datos)

- Problema raíz detectado en tests: el flujo está completo pero los DATOS están vacíos (0/189 con stock, 0 ubicaciones). Poblar abriendo 188 fichas una por una es inviable.
- Hecho: nuevo `components/repuestos/CargaRapidaModal.tsx` — modal de carga ítem por ítem: una fila por material con-SAP con inputs inline (stock · pasillo · estante · nivel), guardado on-blur o Enter (Enter salta a la fila siguiente). Filtro "Solo faltantes" (default) + buscador. Cap de render a 150 filas (los configurados/en-bodega primero) para performance; el resto se acota con el buscador. Reusa `saveStock` de useBodega (upsert en `bodega/{sap}`, preserva stockMinimo/unidad). Enganchado en `BodegaView` (StockTab): botón "Carga rápida" (ámbar, junto a Lote/Config) + estado `showCargaRapida`.
- Verificado en preview (build limpio): botón abre el modal, lista 150 filas + nota "Mostrando 150 de 3777", filtro/buscador OK. Guardado probado end-to-end: escribir pasillo "ZZTEST" + Enter → "1 guardado"; confirmado en Firestore (`bodega/3300100657` pasillo=ZZTEST, mín/unidad preservados) y **revertido** con script admin. Sin errores de consola. tsc=0, eslint=0.
- Nota: el `onBlur` real (usuario hace clic/tab fuera) guarda; en el test el evento blur sintético no gatilla el onBlur de React, por eso se verificó vía Enter (mismo saveRow).
- Archivos: `components/repuestos/CargaRapidaModal.tsx` (nuevo), `pages/repuestos/BodegaView.tsx` (botón+estado+render+import).
- Estado: HECHO. Ahora Orel puede poblar stock+ubicación rápido → "ubicable" pasa de promesa a realidad cuando cargue los datos.

## 2026-06-18 · claude · Foco SAP por defecto en pestaña Áreas

- Pregunta de Orel: por qué Áreas muestra ~7.441 si el foco son los SAP. Correcto: el hub mostraba el maestro completo (con + sin SAP) con "Repuestos totales" de cabecera, diluyendo el foco.
- Hecho en `RepuestosAreaHub`: estado `repSoloSap` (default ON). Se separó `filteredBase` (todos los filtros menos SAP) de `filteredRep` (aplica el foco SAP) + `despieceOcultos` (cuenta el despiece sin SAP oculto). Interruptor "Solo con SAP" en la barra de filtros (muestra "+N despiece" cuando oculta). KPI grande: "Repuestos totales" → **"Repuestos con SAP"** (hint "+N despiece sin SAP"). El despiece sin SAP (capa de identificación) queda a un clic.
- Verificado en preview (build limpio): "casquillo" con foco ON → 73 con-SAP, 0 despiece visible, toggle "+88 despiece"; al apagar → total 161 (suma los 88). tsc=0, eslint=0. (Durante los edits hubo un ReferenceError `filteredRep` TRANSITORIO de HMR por el rename intermedio; desaparece en build limpio, código actual correcto.)
- Sobre la pestaña **Bodega**: se justifica — es la vista SAP-only (su hook: "Solo repuestos con código SAP") = inventario/reposición; hoy está vacía de datos (0 con stock) pero conceptualmente es la cara de stock. Se mantiene.
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`.
- Estado: HECHO.

## 2026-06-18 · claude · Review UX "buscar repuesto" + limpieza menor

- Review como usuario (código + datos): el flujo buscar→encontrar→ubicar está COMPLETO. Fila de resultados: foto, SAP (copiar), nombre, badge de clase, tipo, equipo (N:M con +N), stock con semáforo. Ficha (`RepuestoDetailPanel`): "Dónde se usa · N equipos" (todos los N:M), manuales heredados, stock disp/mín/máx, **Bodega + Ubicación editable inline** (pasillo/estante/nivel), movimientos. Diseño sólido; lo que falta es DATO, no código.
- Datos verificados (solo-lectura): `bodega`=189 con **0 ubicaciones registradas** (1 con pasillo) → "ubicable" físico aún no existe como dato (captura pendiente de Orel). `repuestos.tipo` 59% poblado con categorías útiles (TORNILLERÍA/SOPORTE/CASQUILLO/EJE…) → NO es ruido, se conserva. Fotos: solo 64/7657.
- Limpieza menor (in-scope, segura): borrado `ImageGallery.tsx` (huérfano, cero imports; quita un consumidor de MachineContext), corregido comentario obsoleto de `useBodega` (decía que leía `machines/{id}/repuestos`; lee el maestro), reemplazado `pages/repuestos/README.md` (era guía de migración obsoleta con archivos borrados) por uno breve y actual.
- NO tocado a propósito: refactor de `MachineProvider`/`CategoryManager` (último lector de `machines`) — vive en Settings, fuera del módulo de repuestos; su cleanup es separado y con riesgo en otra feature.
- Verificación: `tsc`=0, `eslint`=0. Preview: módulo OK en /repuestos.
- Archivos: `useBodega.ts` (comentario), `pages/repuestos/README.md` (reescrito), `ImageGallery.tsx` (borrado).
- Estado: HECHO. Módulo de repuestos funcionalmente completo y limpio. Lo pendiente es captura de datos (ubicaciones bodega + fotos) y, aparte, Fase 5 deletes + cleanup de CategoryManager/machines.

## 2026-06-18 · claude · Retiro de página /insumos (redundante con el maestro)

- Decisión de Orel: retirar `/insumos`. Datos (solo-lectura): `insumos`=3552, 294 con stockFisico (del import Excel), **0 con metadata de conteo** (stockContadoEn/Por/historial) → el editor de stock de la página NUNCA se usó; última actualización 2026-06-11 = la migración (no actividad de usuario). La página leía la colección legacy `insumos` (respaldo congelado) y permitía editar stock que el maestro NO ve (dead-end). Insumos ya unificados en el maestro (buscables en Repuestos/Bodega).
- Hecho: quitada ruta `/insumos` + lazy import (App.tsx), enlace del home móvil (MobileHomeGrid) y del editor de sidebar (SidebarEditorPage). Borrados `pages/insumos/InsumosPage.tsx`, `components/insumos/InsumoDetailModal.tsx`, `types/insumos.ts` (huérfanos).
- **`insumos` ya NO tiene lectores vivos en el código** (verificado por grep) → colección LIBRE para borrar en Fase 5 (con backup). NOTA: puede quedar algún enlace `/insumos` en un sidebar guardado en Firestore (dato, no código) → quedaría como link muerto que redirige al default; inofensivo.
- Verificación: `tsc`=0, `eslint`=0 (App/MobileHomeGrid/SidebarEditorPage). Preview: navegar a `/insumos` ya no monta la página (redirige al default, sin crash); `/repuestos` sigue OK (Áreas+Bodega, búsqueda). Persisten los avisos HMR de Vite por archivos borrados (cosméticos, se limpian al reiniciar el dev server).
- Archivos: `App.tsx`, `components/home/MobileHomeGrid.tsx`, `pages/SidebarEditorPage.tsx` (M) + 3 borrados.
- Estado: HECHO. Bloqueos Fase 5 restantes: `machines` (MachineProvider/CategoryManager), `plantAssets` (MapaPlantaPage).

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
