# Módulo de Repuestos

Catálogo de materiales de planta (repuestos, insumos, herramientas, químicos…) sobre
un **maestro único** unificado por código SAP.

## Arquitectura (normalización 2026-06)

- **Maestro `repuestos`** (colección plana, ~7.657 docs): un doc por material.
  Campos clave: `codigoSAP|null`, `tieneSap`, `clase`
  (repuesto·insumo·herramienta·quimico·lubricante·refrigeracion), `tipo` (sub-categoría
  mecánica: tornillería, casquillo, eje…), `equipos:[nodeIds]` (N:M con `hierarchy`),
  `equiposCodigos`, specs físicas (marca/modeloTipo/…), `fotosReales`, `manualesPropios`.
- **`hierarchy`** = jerarquía SAP de áreas/equipos (`tipoNodo` area|equipo). Fuente de verdad.
- **`bodega/{codigoSAP}`** = stock + ubicación (overlay en runtime; no vive en el doc del material).
- **`manuales`** = colección plana N:M; un material hereda los de sus `equipos`.
- **`solicitudes_repuestos`** = pedidos a bodega (pendiente→aprobada→entregada).

## UI — 2 pestañas (`RepuestosPage`)

- **Áreas** (`RepuestosAreaHub`): hub área-first. Búsqueda tier SAP-first, filtro de clase,
  fila con foto/SAP/nombre/clase/tipo/equipo(N:M)/stock. Ficha lateral
  (`RepuestoDetailPanel`): "dónde se usa" N:M, manuales heredados, stock, ubicación editable,
  movimientos, flujos Solicitar / asignar-SAP / asignar-equipo.
- **Bodega** (`BodegaView`): stock real, abre en "configurados".

(La pestaña "Mapas" se retiró en 2026-06 — el editor de pines en planos nunca se usó.)

## Hooks núcleo

- `useGlobalSearch` — carga el maestro (`repuestos` + `hierarchy`) y busca (scorer).
- `useBodega` — mergea catálogo (de useGlobalSearch) + stock de `bodega`.
- `useAreaRepuestos` — filtra por área. `useSolicitudes` — pedidos. `useManualesDeEquipos` — manuales heredados.

## Estado / pendientes

Memoria canónica del proyecto en `.ai/MEMORY.md`, `.ai/TASKS.md`, `.ai/WORKLOG.md`.
Pendiente sobre todo **dato** (no código): cargar ubicaciones de bodega (hoy vacías) y fotos.
Limpieza Fase 5 (borrar colecciones legacy `machines`/`plantAssets`/`insumos`) según TASKS.
