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

## TODO — Centro Técnico Documental (NFPA 70B)

> Diseño aprobado 2026-06-20 con Orel. Spec: `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
> **DESPLEGADO a prod 2026-06-21**: PR #91 (v1–v3b + tableros), PR #92 (portada CTD + v3c) y
> PR #93 (CTD = expediente autosuficiente + migración de Equipos + campo `tipo`) MERGEADOS.
> Reglas `maintenanceLog` + `tableros` desplegadas. El CTD vive en el grupo **Aprendizaje**.
> Decisiones cerradas: **enriquecer el módulo Equipos** (`/equipment`, NO módulo aparte); ficha =
> **campo dedicado `fichaTecnica`** en el registro `equipment`, hereda repuestos/manuales del nodo
> `hierarchy` vía `hierarchyNodeId`; `maintenanceLog` = **colección plana** con `equipmentId` (necesita
> regla en `firestore.rules` → pedir OK a Orel); criticidad = NFPA 70B §2.4 + **condición 1/2/3** (semáforo
> 🟢🟡🔴); próxima inspección = **criticidad × condición** (Cap. 9 / Tabla 9.2.2). Piloto: motor
> `720004608` + bomba `720004607` (NH₃) — verificar que existen como registros `equipment`.

- [x] **v1 — ficha solo-lectura** en `EquipmentPage`: pestaña "Ficha NFPA 70B" con placa + documentos heredados + criticidad + historial. (claude, 2026-06-20, rama `feat/centro-tecnico-documental-v1`)
- [x] **v2 — edición de `fichaTecnica`** — editor inline (placa eléctrica + condición 1/2/3 + vida útil/frecuencia/próxima inspección), guarda en `equipment.fichaTecnica` vía `updateEquipment`. tsc+eslint limpios. Falta cargar la placa real del piloto en la app. (claude, 2026-06-20)
- [x] **v3 — `maintenanceLog`** — colección plana + regla Firestore (read activeUser / create technician) + servicio `getMaintenanceLog`/`addMaintenanceLogEntry` + UI: timeline 🟢🟡🔴 y formulario "Registrar evento" en la ficha. (claude, 2026-06-20)
- [x] **v3b — incidencias en el timeline (auto)** — read-merge: las incidencias del equipo (`equipmentId`) aparecen en el historial junto a las entradas manuales, prioridad→semáforo; sin duplicar datos. (claude, 2026-06-20, worktree por colisión)
- [x] **v3c — próxima inspección automática** — fecha sugerida = criticidad × condición. (claude, 2026-06-21, PR #92)
- [x] **Merge a main** — PR #91 + #92 + #93 mergeados y desplegados (solo redeploy PWA; reglas ya estaban). (Orel, 2026-06-21)
- [x] **CTD = expediente autosuficiente + migración de Equipos** (PR #93, 2026-06-21) — CTD movido a Aprendizaje; el click abre el expediente EN SITIO (pestañas Info/Ficha/Tablero/Fotos/Notas/QR, reusa `FichaTecnicaNFPA70B`+`TableroExpediente`), estado en URL `?eq=&tab=`. Migrado: favoritos+notas (hooks `useEquipmentFavorites`/`useEquipmentNotes`, comparten localStorage con Equipos), editar datos básicos (`EquipmentForm` extraído), fotos subir/borrar. Filtros estado/Sección→Línea(cascada)/Tipo + orden + paginación + vista compacta + completar-ficha. Nuevo campo `Equipment.tipo`. (claude)
- [x] **Backfill `tipo`** — `scripts/backfill-equipment-tipo.js` ejecutado en prod: 508/553 equipos clasificados desde el nombre. (claude, 2026-06-21)
- [x] **CTD "programa vivo"** (PR #94, DESPLEGADO 2026-06-21) — (1) cerrar ciclo: registrar inspección → severidad pasa a condición + reprograma `proximaInspeccion` (criticidad×condición); (2) Agenda de inspecciones (toggle Lista/Agenda, ventanas vencidas/30/60/90/+90/sin fecha); (3) carga masiva de placa por Excel (`services/equipmentFichaExcel.ts`, plantilla+import por código); (4) reporte PDF por equipo (`services/equipmentReportPdf.ts`, jsPDF). (claude)
- [ ] **Cargar placa real del piloto** — motor `720004608` + bomba `720004607` (NH₃): capturar placa eléctrica + condición y validar el flujo completo en vivo. Dueño: Orel
- [ ] **Fijar `tipo` a ~45 equipos sin match** del backfill (Baader/Knuro/climatización/tableros abreviados) a mano en la ficha. Dueño: —

## TODO — Tableros / Unifilares (NFPA 70B)

> Fase 0 "el dato primero" (decisión Orel 2026-06-20): levantamiento estructurado de tableros como base
> para unifilares + histórico de cambios. Protocolo/ficha en OneDrive:
> `ARIA_MANTENIMIENTO_PLANTA/docs/LEVANTAMIENTO_TABLEROS.md`. Fluyo NO es la herramienta del unifilar
> (es para arquitectura de software). El levantamiento inicial se guarda como **Revisión 0 (as-found)**.

- [x] **v1 — levantamiento (Excel + form) → REALINEADO al expediente** — el tablero ES un equipo; el levantamiento/unifilar vive como **tab "Tablero" dentro del expediente del equipo** (`EquipmentPage`, junto a la Ficha NFPA 70B), **NO como módulo `/tableros` suelto** (consistente con "el Centro Técnico Documental enriquece Equipos, no es módulo aparte"). Doc `tableros/{equipmentId}` (1:1). Archivos: `types/tableros.ts`, `services/tableros.ts` (`getTableroByEquipment`/`saveTableroForEquipment`, alta = Revisión 0 as-found), `services/tablerosExcel.ts` (plantilla descargar/importar, SheetJS), `components/equipment/TableroExpediente.tsx`, tab en `EquipmentPage.tsx`, regla `tableros` en `firestore.rules`. Se quitó ruta/nav/`TablerosPage.tsx`. **tsc limpio; preview en vivo OK** (tab "Tablero" monta en el expediente; lectura da `permission-denied` hasta desplegar reglas). (claude, 2026-06-20, rama `feat/levantamiento-tableros-v1`, commits `91ad1367`→`046df802`, sin push)
- [x] **Merge + deploy reglas** — DESPLEGADO 2026-06-21 (vía PR #91); regla `tableros` activa, el tab "Tablero" ya lee/escribe. (Orel)
- [ ] **Levantar tablero piloto** — CCM que alimenta motor 720004608 + bomba 720004607. Dueño: —
- [ ] **Filtro "Tableros" en Equipos** — "ver todos los tableros" = filtro en `/equipment` (equipos con doc en `tableros`). Aún no hecho. Dueño: —
- [ ] **v2** — fotos a Storage (no cableado en v1) · enlazar `cargaNombre`→`cargaNodeId` de `hierarchy` · render del unifilar sobre el dato levantado. Dueño: —

## Backlog general / futuro

- [ ] ARIA local (Ollama): definir cómo consulta el maestro (export Firestore o API solo-lectura).
- [ ] Puente de datos curado para ARIA (sin duplicar la fuente de verdad).

## Hecho (reciente)

- [x] Normalización repuestos Fases 0–6 (maestro SAP) + rework UI incrementos 1–7. (claude, 2026-06-12 — ver WORKLOG)
