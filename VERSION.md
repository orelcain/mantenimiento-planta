# 🚀 Sistema de Versionado - Mantenimiento PWA

## Versión Actual: **v3.48.1**

**Fecha de lanzamiento**: 22 de mayo de 2026  \
**Estado**: 🚀 PRODUCTION READY  \
**Build**: ✅ Stable

---

## 📋 Información de la Versión

### v3.32.3 — Panel Admin: visibilidad de TODOS los módulos del sidebar (22/05/2026)
- 🧩 **Panel "Módulos del sidebar" (`/admin/dev-modules`)**: ahora lista los 19 items en dos secciones (**En desarrollo** ocultos por default / **En producción** visibles por default) en vez de solo los ocultos
- 👁️ **Mostrar u ocultar cualquier módulo a conveniencia**: la preferencia se guarda por dispositivo (localStorage), no afecta a otros usuarios
- 🔒 **Salvaguarda anti-bloqueo**: el switch de **Panel Admin** queda fijo (no ocultable) — es la única vía de vuelta al toggle
- 🛠️ Refactor interno: `DEV_NAV_ITEMS` → `ALL_NAV_ITEMS` (catálogo completo con metadata `inDevelopment`/`locked`); filtro de sidebar y bottom-nav generalizado con default por tipo

### v2.115.0 — FASE 12: Landing unificado + Vista Turno /turno/:shiftId (17/04/2026)
- 🏠 **Nueva Landing `/analisis-grader`**: hero con botón upload + live shift detector + grid de turnos recientes (14 días) + calendario histórico + accesos rápidos
- 📊 **HeroScorecard**: scorecard principal del turno con P0%, piezas, pz/min, kg, badge live/closed y barra de progreso para turnos activos
- 🔴 **P0CausesPanel**: panel expandible de causas Matrix (fuera_de_límites / no_leido_fotocelula / puerta_no_preparada / otro) con graceful degradation si no hay Excel P0
- 🔀 **Nueva ruta `/analisis-grader/turno/:shiftId`**: vista unificada del turno, carga directa desde Firestore sin re-parsear Excel
- 🔁 **Redirect `/detalle` → `/turno/:shiftId`**: compatibilidad hacia atrás con links anteriores
- 📅 **GraderHistoricalCalendar actualizado**: navega a la nueva ruta `/turno/` en vez de `/detalle`

### v2.81.0 — Grader iter 13: UI calendar mejorado + fix duración anómala + delete registro (11/04/2026)
- 📅 **Badges P0% por turno en calendario**: cada celda del mes muestra etiquetas "D" y "N" con color propio según P0% real del turno (verde/amarillo/rojo), reemplazando el promedio único anterior
- 🗑️ **Botón eliminar registro**: en el panel lateral del calendario, cada turno tiene un botón rojo Trash2 para borrar summaries erróneos directamente de Firestore sin salir de la vista
- ⏱️ **Fix duración anómala en display**: cuando `durationMinutes` almacenado supera 1440 min (bug de fusión tarde→noche), se deriva la duración desde `endAt - startAt` con cap de 24h — aplica tanto en el calendario como en la vista detalle
- 🧹 **Header simplificado**: botones "Calendario" y "Carga masiva" eliminados del header del Wizard (redundantes en el flujo diario actual)

### v2.80.0 — Grader iter 12: fix durationMinutes + tendencia + alertas + IA desde Firestore (11/04/2026)
- 🔧 **Fix `durationMinutes` inflado en summaries fusionados**: `mergeTwoSummaries` usaba span de timestamps en vez de suma de duraciones — corregido a `base.durationMinutes + legacy.durationMinutes`
- 📈 **Gráfico de tendencia P0%**: la vista detalle de turno muestra los últimos 20 turnos como línea Chart.js (sin re-parsear Excel), con el turno actual destacado en rojo
- 🔔 **Alertas automáticas determinísticas**: 5 reglas sobre el summary guardado (P0 elevado, causa dominante, muestra pequeña, tendencia ascendente, duración >13h)
- 🤖 **Diagnóstico IA desde historial**: `analyzeGraderFromSummary` construye `AIGraderInput` desde `GraderDailySummary` y llama a Groq — sin necesidad de re-cargar Excel
- 🕐 **Contexto 45 días**: `AnalisisGraderDetallePage` trae turnos recientes de Firestore para nutrir tendencia, alertas e IA

### v2.70.66 — Persistencia real de markup admin en mapas isométricos (16/03/2026)
- 🗂️ **Guardado en documento real**: la base georreferenciada ahora persiste coordenadas, sample step y marcas admin de caminos/estructuras dentro del mapa isométrico guardado
- 🧭 **Recuperación al cargar**: al abrir un mapa existente se restauran las máscaras admin desde Firestore en vez de depender solo del navegador local
- 🧱 **Puente completo base-editor**: el flujo terrain-base ya entrega estas marcas al modelo persistido para usarlo como base confiable de edición posterior

### v2.70.34 — Vista base georreferenciada para importación de terreno (08/03/2026)
- 🛰️ **Vista A en la PWA**: la etapa base ahora muestra un mapa satelital georreferenciado con relieve real antes de importar el terreno al canvas editable
- 📍 **Validación espacial directa**: se marcan los puntos P1–P4 sobre el rectángulo real para revisar orientación, cobertura y escala en el flujo operativo
- 🏔️ **Lectura topográfica mejorada**: se superponen microrelieve continuo y curvas de nivel locales para comparar mejor la forma del terreno sin salir del módulo real

### v2.70.33 — Encuadre del visor basado en límites reales del terreno (08/03/2026)
- 🎯 **Fit real del mapa**: el cálculo de “ver mapa completo” ahora considera los límites del terreno importado en vez de depender solo del lienzo base
- 🔄 **Reencuadre automático**: después de una importación exitosa, el visor recalcula el encuadre para mostrar mejor el terreno completo
- 🧭 **Menos sensación de corte**: el mapa deja de verse como si tuviera límites de visualización fijos cuando el relieve ocupa un área distinta al canvas vacío

### v2.70.32 — Cota visible del terreno en el visor (08/03/2026)
- 📐 **Dimensiones legibles**: el visor muestra una cota compacta con ancho, largo, subida, bajada y desnivel total del terreno cargado
- 🧭 **Lectura directa**: se exponen además la cota mínima y la cota máxima para comparar el relieve real con la forma visual del mesh
- 🎯 **Diagnóstico más claro**: ahora se puede distinguir si el mapa no “se parece” por proporciones reales del terreno o por la representación visual

### v2.70.31 — Fix del rebote tras importar base local (08/03/2026)
- 🛡️ **Base local preservada**: la carga automática de mapas guardados ya no puede sobrescribir una base recién importada mientras la petición inicial sigue en curso
- ✨ **Menos parpadeo**: se elimina el rebote donde el terreno aparecía un instante y luego volvía la etapa base por un `applyMapDocument(null)` tardío
- 📏 **Muestreo inicial correcto**: el paso de importación ahora inicia realmente en 1 m, consistente con la interfaz visible

### v2.70.30 — Panel de importación horizontal y versión sincronizada (08/03/2026)
- ↔️ **Panel horizontal**: la sección de importación del mapa base se reorganiza en horizontal para reducir altura ocupada
- 🔁 **Panel compacto tras carga**: cuando ya existe terreno importado, el bloque superior mantiene la misma función pero con menos peso visual
- 🏷️ **Versión sincronizada**: se alinean `APP_VERSION`, `package.json` y el versionado público para evitar diagnósticos confusos en cliente

### v2.70.29 — Vista sin grilla base y muestreo base de 1 m (08/03/2026)
- 🧼 **Sin grilla base**: se oculta temporalmente la grilla/plano visual del canvas para revisar el terreno importado sin interferencia
- 📏 **Una sola opción visible**: el panel de importación deja solo la opción base de 1 m para simplificar la prueba
- ⚙️ **Ajuste automático intacto**: si el canvas supera el límite operativo, el sistema sigue pudiendo subir el muestreo efectivo internamente

### v2.70.28 — Terreno importado con mejor legibilidad visual (08/03/2026)
- 🗺️ **Terreno más visible**: se aclara la paleta topográfica y se aumenta el contraste del material del terreno importado
- 📐 **Menos interferencia**: la grilla base se atenúa automáticamente cuando existe una malla de terreno para no competir con la topografía
- 🧭 **Lectura más clara**: las curvas de nivel quedan más visibles sobre fondos oscuros

### v2.70.27 — Etapa base reducida a importación mínima (08/03/2026)
- 🧱 **Workspace base mínimo**: la etapa inicial del visor ahora muestra solo la importación de terreno y el estado de la sesión
- 🧹 **Menos ruido en arranque**: se ocultan selector de mapa, nombre, descripción, resumen y acciones secundarias mientras definimos el nuevo flujo
- 🎯 **Foco real en la base**: la pantalla inicial queda preparada para ir agregando funciones solo cuando tengan un lugar claro

### v2.70.26 — Feature flags: UI mínima para visor de mapas (08/03/2026)
- 🏷️ **Feature flags**: se agregó sistema de banderas (`FEATURES`) para controlar la visibilidad de cada sección del visor de mapas
- 🧹 **Solo lo esencial**: al arrancar solo se muestra la importación de terreno, el canvas 3D y controles básicos de cámara
- 🛠️ **Desarrollo progresivo**: cada función (editor, áreas, búsqueda, propiedades, etc.) se activa individualmente en `FEATURES` conforme se necesite

### v2.70.25 — Flujo simplificado del visor de mapas (08/03/2026)
- 🧭 **Base una vez, edición después**: los mapas con base ya configurada abren directo en modo editor en lugar de volver siempre a la etapa inicial
- 🧹 **Menos ruido visual**: se retiran del módulo principal los paneles heredados de incidencias y filtros globales que mezclaban responsabilidades
- 🛠️ **Base como ajuste puntual**: la configuración topográfica sigue disponible, pero ahora queda como acción de recalibración y no como flujo dominante

### v2.70.24 — Preview y progreso de importación en visor de mapas (08/03/2026)
- 🧭 **Previsualización operativa**: el panel de terreno ahora estima rectángulo real en metros, canvas final autoexpandido y densidad efectiva antes de importar
- 📊 **Progreso visible por lotes**: la consulta de elevaciones muestra avance real por porcentaje, lotes y puntos consumidos mientras responde la API externa
- 🧱 **Feedback unificado**: la mejora aparece tanto en la fase base del workspace como dentro del modal del editor de terreno

### v2.70.23 — Hotfix deploy visor de mapas (08/03/2026)
- 🛠️ **Typecheck remoto corregido**: se blindan accesos potencialmente indefinidos en el render de paleta topográfica y curvas de nivel
- 🧵 **Frame del underlay corregido**: el marco del plano base pasa a renderizarse como objeto Three.js compatible con el chequeo estricto de CI
- 🚀 **Pipeline destrabado**: el build remoto vuelve a compilar después del refactor del visor

### v2.70.22 — Base topográfica primero para el visor de mapas (08/03/2026)
- 🧭 **Fase base prioritaria**: el módulo abre primero en modo de importación y revisión del terreno real desde 4 coordenadas
- 🧹 **Menos ruido visual**: se ocultan incidencias, buscador, filtros y elementos secundarios mientras se valida la base del mapa
- 🧩 **Refactor inicial real**: la importación de terreno y el workspace base se extraen a componentes dedicados para bajar complejidad en `MapPage`
- 🚧 **Camino claro para la siguiente etapa**: creación y edición quedan separadas del flujo principal de importación

### v2.70.21 — Calibración visual del plano base sobre terreno real (08/03/2026)
- 🗺️ **Plano base interactivo**: el raster ahora se puede mover, escalar y rotar directamente dentro del canvas con modo visual de calibración
- 💾 **Biblioteca real de layouts**: soporte para cargar mapas guardados, editar nombre/descripción, guardar y guardar como nuevo
- 📏 **Validación operativa**: métricas visibles de cobertura del lienzo y densidad en px/m para revisar si el plano sirve a escala 1 m
- 🎛️ **Alineación rápida**: acciones para centrar, ajustar al lienzo, resetear calibración y hacer nudges por botones o teclado

### v2.70.17 — Terreno real con coordenadas editables y fallback anti-429 (07/03/2026)
- 🧭 **Coordenadas editables**: ahora puedes pegar/editar manualmente las 4 coordenadas (`lat, lon`) en el modal de importación.
- 🧱 **Detalle de malla configurable**: selector de resolución (`4m`, `6m`, `8m`, `10m`, `12m`) para balancear precisión y velocidad.
- 🔁 **Antithrottling**: reintentos automáticos con backoff cuando el proveedor responde `429`.
- 🌐 **Proveedor alternativo**: fallback automático a OpenTopoData si Open-Meteo está limitado por cuota.

### v2.70.16 — Hotfix de deploy por import faltante (07/03/2026)
- 🛠️ **Corrección de compilación**: import faltante de `MAX_TERRAIN_ELEVATION` en la escena isométrica
- ✅ **Deploy recuperado**: se elimina el fallo de build en GitHub Actions para publicar la release

### v2.70.15 — Mapa de calor por metro + herramientas de maquinaria (07/03/2026)
- 🌡️ **Mapa de calor real**: gradiente de color por metro desde azul (`-50 m`) a rojo (`+200 m`)
- 👷 **Feedback de cota en brocha**: indicador en vivo de metros bajo la brocha para saber exactamente a qué altura estás trabajando
- 🚜 **Herramientas con nomenclatura pesada**: `Bulldozer`, `Excavadora`, `Niveladora`, `Rodillo`, `Topógrafo`
- 📐 **Niveladora por cota exacta**: corte/relleno directo a la altura objetivo (sin interpolación suave)

### v2.70.14 — Topes editables y regla métrica de terreno (07/03/2026)
- 📏 **Topes de edición configurables**: define hasta dónde construir/escavar por pincel sin salirte del rango operativo
- 🎯 **Preset rápido de trabajo**: botón directo para usar `-30 m` y `+60 m`
- 🧱 **Pincel acotado por rango**: subir/bajar/suavizar/aplanar respetan los límites activos
- 🌈 **Regla visual de metros**: gradiente vertical con marcas de negativos/positivos y resaltado de ventana editable
- 🎨 **Lectura por capas de 1m**: coloración bandada para distinguir alturas con más precisión

### v2.70.13 — Terreno sólido volumétrico (06/03/2026)
- 🪨 **Masa real de terreno**: el mapa ya no renderiza solo una superficie; ahora existe volumen sólido del terreno
- 🧱 **Bloque base geológico**: base inferior y paredes laterales continuas hasta `-50 m`
- ⛏️ **Editar = agregar/quitar tierra**: subir/bajar modifica una columna de masa, no solo una piel visual
- 🌄 **Acabado suave arriba**: se mantiene superficie orgánica tipo Sims para evitar look pixelado

### v2.70.12 — Terreno estilo Sims + superficie suavizada (06/03/2026)
- 🏔️ **Esculpido natural de terreno**: brocha circular con caída radial para subir/bajar terreno sin bordes en bloque
- 🎚️ **Control fino y rápido**: tamaños de brocha `1×1, 3×3, 5×5, 7×7, 9×9` e intensidad configurable `1-5`
- 🌊 **Rango operacional real**: edición de elevación entre `-50 m` y `+200 m` con feedback visual explícito
- 🧽 **Suavizado progresivo**: herramienta `Suavizar` mejorada con mezcla ponderada de vecinos, más parecida a flujo tipo Sims
- 🎨 **Render de terreno mejorado**: superficie continua tipo heightfield con gradiente tierra/agua para desniveles más orgánicos

### v2.70.6 — Hotfix vacaciones hábiles + badge visible en control (05/03/2026)
- 📅 **Vacaciones según regla hábil**: `Vac S/M` y `Vac H S/M` vuelven a respetar la opción `Vacaciones contabilizan solo días hábiles`
- 🏖️ **Motivo del 49h corregido**: ya no suma 7 días de vacaciones cuando la regla está en hábiles (evita semanas de 49h por vacaciones corridas)
- 🏷️ **Badge operativo en Control**: cada técnico con vacaciones muestra `VAC S:x M:y` junto al nombre

### v2.70.5 — Hotfix extensión vacía y vacaciones en control (05/03/2026)
- ⬜ **Extensión limpia**: al agregar semanas/meses nuevos, las celdas quedan vacías (no prellenadas como `LIBRE`)
- 🏖️ **Vacaciones robustas en Control**: se reconocen variantes de texto (`VAC`, `VACACIÓN`, `VACACIONES`) para contabilizar días y horas
- 🧮 **Cálculo coherente de horas**: etiquetas de vacaciones ya no se interpretan como turno trabajado por error de texto

### v2.70.4 — Hotfix de fechas extendidas y semana por click (05/03/2026)
- 🧭 **Parseo de fecha corregido**: se elimina interpretación ambigua de strings para evitar saltos tipo `04/03`, `04/04` al extender columnas
- 🧹 **Columnas válidas solamente**: el calendario detecta día solo cuando hay encabezado semanal válido + fecha real
- 🔄 **Sincronización robusta Control**: al hacer click en día/celda se actualizan siempre semana y mes seleccionados
- 🧱 **Hidratación saneada**: columnas persistidas se reconstruyen desde fecha válida (día y label normalizados)

### v2.70.3 — Calendario extendible y control sincronizado por día (05/03/2026)
- 🗓️ **Extensión directa del calendario**: nuevos botones `Extender +4 semanas` y `Extender +1 mes` para seguir planificando sin rehacer Excel
- 🎯 **Selección inteligente**: al hacer click en un día/celda, se sincroniza automáticamente la semana y mes del panel de Control
- 🌞 **Visibilidad mejorada**: resaltado más claro de día actual y de columna/celda seleccionada para operación en terreno
- 🧮 **Vacaciones reflejadas en conteo**: días y horas de vacaciones se contabilizan en semana/mes/total de forma consistente
- ↕️ **Orden estable de técnicos**: Control mantiene el orden original de turnos (A/B/C) sin reordenamiento automático
- 🧷 **Grupos profesionales**: etiquetas visuales de turnos A/B/C más claras en la grilla

### v2.70.2 — Estandarización de cierre con deploy obligatorio (05/03/2026)
- 📘 **Gobernanza de release formalizada**: se documenta en guías oficiales el cierre obligatorio con versionado + validación + commit + push + deploy
- 🚀 **Deploy de hosting obligatorio**: se incorpora `firebase deploy --only hosting --non-interactive --json` como paso mandatorio al final de cada iteración aprobada
- ✅ **Criterio de cierre explícito**: no se considera completa una mejora sin confirmación de `status: success` en Firebase Hosting

### v2.70.1 — Cumplimiento legal 6x1 con esperado por técnico (05/03/2026)
- ⚖️ **Modo legal por régimen**: nuevo parámetro `Días trabajo/semana` (6x1, 5x2, 7x0)
- 🧠 **Esperado por días programados**: cálculo semanal y mensual por técnico según turnos realmente asignados
- 📏 **Meta diaria legal derivada**: `jornada semanal / días trabajo semana` visible en la pestaña Horas
- 📊 **Control más exacto**: evita sub/sobrecálculo mensual por prorrateo simple cuando hay rotación real

### v2.70.0 — Calendario Mantención integrado en PWA con turnos configurables (04/03/2026)
- 📅 **Nuevo módulo PWA**: `Calendario Mantención` integrado con ruta, menú y permisos por rol
- ⌨️ **Edición operativa rápida**: atajos por celda `D/T/N/L` para asignación de turnos
- 🧮 **Control de horas**: cálculo semanal y mensual con tolerancia y semáforo visual
- ⚙️ **Configuración flexible**: plantillas de turnos, jornada, colación y horas esperadas editables
- 📤 **Continuidad con Excel**: carga automática de plantilla base y exportación del calendario actualizado

### v2.69.19 — Presets de flujo para orden y usabilidad intuitiva (28/02/2026)
- 🧩 **Preset selector en editor**: `Diseñar áreas`, `Poblar equipos`, `Ajuste fino` dentro del panel `Editor Rápido`
- 🔀 **Prioridad real por preset**: reordenamiento de acciones según contexto (sin selección, área activa, equipo activo)
- 🧠 **Guía adaptativa**: el bloque `Siguiente recomendado` ahora considera el preset elegido para orientar el próximo paso

### v2.69.18 — Orden y usabilidad intuitiva del Editor Rápido (28/02/2026)
- 🧭 **Guía operativa contextual**: nueva tarjeta `Siguiente recomendado` que indica el próximo paso según selección y modo activo
- 🧱 **Estructura más clara**: separación explícita entre `Acciones contextuales` y `Utilidades globales`
- 💬 **Micro-ayudas por acción**: textos breves bajo botones clave para reducir curva de aprendizaje en terreno

### v2.69.17 — Editor rápido dinámico por modo activo (28/02/2026)
- 🔀 **Prioridad por modo**: el panel reordena acciones según `select/move/add` además del contexto área/equipo
- 🟢 **Modo visible y guiado**: se agrega indicador de modo activo con feedback visual y acciones de salida rápida (ej. salir de `add` o finalizar `move`)
- 🎯 **Flujo más natural**: en `add` se prioriza alta/configuración de equipo; en `move/select` se prioriza edición contextual

### v2.69.16 — Editor rápido dinámico por contexto área/equipo (28/02/2026)
- 🧠 **Opciones contextuales**: el panel `Editor Rápido` ahora muestra acciones distintas según selección activa (sin selección, área seleccionada o equipo seleccionado)
- 🧭 **Flujo guiado por contexto**: al seleccionar equipo se priorizan acciones de equipo (forma, vínculo, área asociada); al seleccionar área se prioriza edición/alta en área
- 🧹 **Lógica simplificada**: uso de `areaById` para resolver áreas activas/asociadas y reducir búsquedas repetidas en render

### v2.69.15 — Refactor flujo de editor de áreas extraído de MapPage (28/02/2026)
- 🧩 **Nuevo hook dedicado**: `useAreaEditorFlow` encapsula estado y handlers de área (`paint/open/close/save/delete`)
- 🧹 **MapPage más limpio**: se elimina lógica inline del ciclo de edición de áreas sin cambiar UX ni comportamiento
- 🎯 **Interacción de piso consolidada**: `onFloorClick` delega el pintado de tiles al hook para reducir acoplamiento

### v2.69.8 — Hotfix CI/deploy TypeScript estricto (28/02/2026)
- 🧯 **Corrección de build en Actions**: `parseVoxelKey` ahora garantiza `x/y/z` numéricos sin `undefined`
- ✅ **Compatibilidad strict TS**: eliminados errores `number | undefined` en cálculos de voxel/caras dentro de `ShapeEditorDialog`
- 🚀 **Deploy desbloqueado**: la cadena `release:pwa:verify + tsc + lint + build` vuelve a pasar completa

### v2.69.7 — Fase 3 MVP: importación externa y exportación de formas (28/02/2026)
- 📥 **Importación externa en editor**: nuevo flujo `Importar` en `ShapeEditorDialog` para archivos `.json`, `.glb` y `.gltf`
- 🧱 **Conversión GLB/GLTF a voxel**: el modelo importado se voxeliza automáticamente en la grilla para continuar esculpido interno
- 📤 **Exportación de forma**: nuevo botón `Exportar` que descarga la forma activa en JSON (primitivas + estado voxel)
- 🧭 **Feedback de importación**: mensajes de estado en cabecera para éxito/error de importación

### v2.69.6 — Fase 2: editor por caras con subdivisión (28/02/2026)
- 🧩 **Editor por caras**: selección de cara activa (`Top`, `Bottom`, `Left`, `Right`, `Front`, `Back`) en modo voxel
- 🔲 **Subdivisión por cara**: grilla 2D configurable (`2×2`, `4×4`, `6×6`, `8×8`) para seleccionar zonas de la cara
- ⬆️ **Extrusión por normal**: acción `Extruir cara` que proyecta la selección siguiendo la normal de la cara activa
- 🎯 **Selección inteligente**: selección de cara completa y selección parcial por celdas de subdivisión

### v2.69.5 — Fase 1 MVP: esculpido voxel (28/02/2026)
- 🧱 **Modo voxel**: alternancia entre `Primitivas` y `Voxel` dentro de `ShapeEditorDialog`
- 🛠️ **Herramientas base**: pintar, borrar, seleccionar por capa Y y extrusión vertical (`+Y/-Y`)
- 👁️ **Preview y métricas unificadas**: visor 3D y guardado usan la geometría activa según modo de edición

### v2.69.4 — Editor de forma más amplio y mejor visual 3D (28/02/2026)
- 🖥️ **Modal ampliado**: `ShapeEditorDialog` aumenta ancho máximo y altura útil para trabajar con mayor comodidad
- 👁️ **Preview 3D más grande**: visor en vivo con más área para inspeccionar volumen y proporciones al editar
- 🧭 **Ayuda de interacción**: indicaciones visibles de controles de órbita/zoom/pan dentro del visor

### v2.69.3 — Hotfix definitivo: overlays bajo panel de incidencias (28/02/2026)
- 🧯 **Fix definitivo de capas**: overlays `Html` de equipos/áreas forzados a `zIndexRange [0,0]` y `zIndex: 0`
- 🧱 **Paneles UI reforzados**: panel de incidencias/propiedades y botón flotante con `z-40` explícito en el mapa
- ✅ **Resultado**: nombres de equipos/áreas ya no se dibujan por encima del panel de incidencias ni otros overlays de UI

### v2.69.2 — Regla global de capas seguras para overlays 3D (28/02/2026)
- 🛡️ **Blindaje global**: clase compartida `map-overlay-html` para todos los overlays `Html` del mapa isométrico
- 🧱 **Prevención futura**: regla CSS centralizada en `index.css` para garantizar que labels/badges queden bajo cualquier modal

### v2.69.1 — Hotfix z-index labels sobre modales (28/02/2026)
- 🧯 **Fix visual crítico**: labels/badges `Html` del mapa isométrico ya no se dibujan sobre modales y paneles
- 🧱 **Stacking consistente**: ajuste de `zIndexRange`/`zIndex` en overlays de equipos y áreas para respetar la jerarquía UI

### v2.69.0 — Gestión centralizada de áreas + editor de forma con preview 3D en vivo (28/02/2026)
- 🗂️ **Gestor centralizado de áreas**: botón `Gestionar áreas` en Editor Rápido con listado único y filtro por piso (Todos/PB/2°/Techo)
- ✏️ **Acciones directas por área**: `Ver`, `Editar`, `Eliminar` desde una sola vista para reducir fricción operativa
- 🎯 **Selección de áreas mejorada**: selección por click en escena y desde buscador, con highlight visual del área activa
- 🎨 **Visibilidad reforzada de superficies**: opacidad mínima para evitar áreas invisibles por configuración de color/opacidad
- 🧱 **Editor de forma más intuitivo**: botón `Editar forma equipo` visible siempre (deshabilitado si no hay selección)
- 👁️ **Preview 3D en vivo**: visor embebido en `ShapeEditorDialog` que refleja cambios de primitivas en tiempo real
- 📐 **Métricas de ocupación**: caja envolvente y huella aproximada en m²/cuadros para ajustar dimensiones con precisión

### v2.68.0 — Zoom 500 + Pan suave + 6 nuevos tipos equipo + Mapa Planta Chonchi real (27/02/2026)
- 🔍 **Zoom ampliado**: rango extendido hasta 500 (antes 200), stepping progresivo 6% del zoom actual
- 🖱️ **Pan suave**: sensibilidad inversamente proporcional al zoom (30/zoom), movimiento fino a zoom alto
- 🏭 **6 nuevos tipos de equipo 3D**: evaporador (carcasa + serpentín + ventiladores), condensador (cilindro horizontal + tapas), panel eléctrico (gabinete + LEDs), extractor (carcasa + hélice + ducto), transformador (tanque + radiadores + aisladores), caldera (cilindro + chimenea + puerta hogar)
- 🎨 **Color personalizable por nodo**: propiedad `node.color` override sobre color de tipo por defecto
- 🗺️ **Mapa Planta Chonchi real**: 160×120m con 30 zonas (Proceso, Túneles, Frigorífico, Sala Máquinas, Acopio, Planta Yal, etc.), ~80 equipos con códigos SAP reales (720004xxx), 14 conectores de flujo/NH3/eléctricos
- 📐 **16 tipos de equipo total**: bomba, motor, transportador, tanque, compresor, válvula, sensor, tubería, edificio, evaporador, condensador, panel, extractor, transformador, caldera, genérico

### v2.67.2 — Vinculación datos reales + LinkEntityDialog + useMapRuntimeData (27/02/2026)
- 🔗 **LinkEntityDialog**: diálogo de búsqueda/selección de Equipment y Zone reales para vincular a nodos del mapa isométrico (tabs, search, badges de estado, desvincular)
- 📊 **useMapRuntimeData**: hook que genera NodeRuntimeData desde datos reales de Firestore (Equipment.estado → OperationalStatus, conteo de incidencias activas por equipo)
- 🏷️ **NodePropertiesPanel**: botón "Vincular con entidad real" reemplaza placeholder, muestra nombre resuelto de la entidad vinculada
- 🔧 **CI fix**: hooks llamados condicionalmente corregidos (Rules of Hooks), useEffect deps completas, imports no usados eliminados

### v2.67.1 — Modo Editor del Mapa Isométrico (27/02/2026)
- ✏️ **Editor Mode**: toggle view/edit con hotkeys (V/M/A/G/T/Delete/Ctrl+Z/Y/D)
- 🎯 **DraggableNode**: arrastrar equipos con raycasting a plano Y=0, snap to grid
- 🛠️ **EditorToolbar**: HUD flotante con herramientas Select/Move/Add, snap toggle, undo/redo, save/cancel
- 📝 **NodePropertiesPanel**: panel lateral con nombre, tipo, posición XYZ, tamaño, rotación, visibilidad
- ➕ **AddEquipmentDialog**: modal con 10 presets de equipos, búsqueda, nombre custom
- ↩️ **useEditorHistory**: undo/redo con 50 snapshots, deep clone
- 🔍 **Zoom mejorado**: inicial 25 (antes 50), pasos ±10 (antes ±5), rango 5-200 (antes 15-120)

### v2.67.0 — Mapa Isométrico 3D: Three.js + Cámara FFT + Equipos interactivos (27/02/2026)
- 🎲 **Datos demo**: planta industrial con 25 equipos, 10 conectores, 5 áreas para visualización inmediata

### v2.66.5 — Fix permisos incidencias + feedback save (27/02/2026)
- 🔧 **COMPONENT_WORDS blocklist**: palabras genéricas (motor, bomba, sensor, filtro, etc.) ya no matchean como nombres de máquinas
- 🔍 **Fix**: "motores para la grader" ahora retorna solo los 2 motores, no los 51 repuestos de 5 máquinas
- 🧠 **Root cause**: "Motor bomba caseta agua mar" matcheaba por "motor" → eliminaba "motor" de componentTerms → listAllForMachine=true

### v2.64.4 — Fix Brain toggle + Safety-net matching + Debug logging (26/02/2026)
- 🧠 **Brain toggle visible**: admin ahora tiene permisos `aria:configurar` — botón Brain aparece en chat
- 🔍 **Safety-net matching**: segunda pasada simple (`includes`) rescata repuestos que el fuzzy matching pierde
- 📊 **Debug logging**: `console.warn` detallado del pipeline RAG (query → terms → machines → matches)
- 🔐 **Admin full ARIA access**: eliminada restricción "ARIA requiere habilitación explícita" para admin

### v2.64.3 — RAG repuestos mejorado + Firestore rules ARIA (26/02/2026)
- 🔍 **RAG mejorado**: ahora muestra TODOS los repuestos encontrados (con y sin stock), incluye descripción y ubicación
- 📊 **Conteo explícito**: contexto RAG indica "N encontrados (X con stock, Y sin stock)" con instrucción obligatoria de listar todos
- 🛡️ **SYSTEM_PROMPT reforzado**: prohíbe filtrar por "disponible", obliga a usar "en catálogo" y mostrar items con Cant: 0
- 🔐 **Firestore rules**: reglas de seguridad para ariaMissionLogs, ariaThinkingUsage, ariaMemory y ariaLearning

### v2.64.2 — Detección inteligente de tareas + AgentBadge mejorado (26/02/2026)
- 🏭 **Patrones industriales**: detecta repuesto, motor, grader, bomba, variador → clasifica como `analysis`
- 🧠 **AgentBadge mejorado**: muestra tipo de tarea, indicador de pensamiento profundo, y warning de fallback
- 📊 **taskType + thinkingUsed**: se guardan en cada ChatMessage para trazabilidad
- 🦙 **Llama**: agregar capability `analysis` como fallback para consultas industriales

### v2.64.1 — Fix Firestore undefined + API Keys desde admin (26/02/2026)
- 🔧 **Fix Firestore**: filtrar campos `undefined` antes de escribir MissionLog (error setDoc)
- 🔑 **API Keys en admin**: sección en Mission Control para configurar DeepSeek/Groq/Gemini sin rebuild
- 🔄 **providerKeys en Firestore**: las keys se aplican en runtime al cargar config

### v2.64.0 — ARIA Agent Activity: Transparencia multi-agente en chat (26/02/2026)
- 🔍 **Agent Activity Indicator**: indicador animado en el chat muestra qué agente IA está trabajando en tiempo real
- 🏷️ **Agent Badge**: cada respuesta de ARIA muestra qué agente la generó (emoji + nombre + latencia)
- ⚡ **Fases visibles**: analyzing → selecting → calling → streaming → done con colores diferenciados
- 🔄 **Fallback visible**: el usuario ve cuando ARIA cambia de agente por fallback
- 🔑 **DeepSeek R1 habilitado**: API key integrada, agente activo en la cadena de orquestación
- 🎨 **UX mejorada**: transiciones suaves, badges minimalistas, información sin ruido

### v2.63.0 — ARIA Mission Control: Orquestación multi-agente (26/02/2026)
- 🛰️ **Mission Control**: nueva pestaña en Configuración para monitorear todos los agentes IA
- 🤖 **4 Agentes IA**: Gemini Flash, DeepSeek R1, Qwen QwQ-32B (Groq), Llama 3.3 (Groq)
- 🧠 **ARIA Orquestadora**: detecta tipo de tarea y elige el mejor agente automáticamente
- ⚡ **Fallback automático**: si un agente falla/rate-limit, pasa al siguiente en cadena
- 📊 **Mission Log**: registro de cada misión con agente, latencia, tokens, status
- 🔧 **Admin config**: habilitar/deshabilitar agentes, prioridades, estado en tiempo real
- 🎯 **Task detection**: clasifica mensajes como reasoning/code/analysis/speed/general
- 🟢 **Live status**: auto-refresh cada 10s, indicadores de estado por agente
- 📈 **KPIs**: agentes online, requests hoy, tokens hoy, tasa de éxito
- 🔗 **DeepSeek R1**: nuevo provider API compatible con OpenAI (VITE_DEEPSEEK_API_KEY)

### v2.62.0 — Sistema completo de gestión ARIA Thinking (25/02/2026)
- 🧠 **Pensamiento profundo**: toggle en chat header (icono Brain) para activar/desactivar modo thinking de Gemini
- 🔐 **Permisos thinking**: acción 'configurar' en módulo ARIA controla quién puede usar pensamiento profundo
- 📊 **Tracking diario**: registro automático de requests + tokens por usuario/día en Firestore
- ⚖️ **Límites diarios**: límite global configurable + overrides por usuario individual
- 🖥️ **Panel admin ARIA**: nueva pestaña "ARIA" en Configuración con:
  - Config global (límite diario, budget de tokens)
  - Consumo de hoy con barras de progreso por usuario
  - Historial de 7 días con gráfico de barras
  - Límites personalizados por usuario
- 🛡️ **AriaConfig Firestore**: `settings/ariaConfig` para configuración centralizada
- 📈 **Monitoreo consumo**: `ariaThinkingUsage/{date}/users/{userId}` para tracking granular

### v2.61.0 — Permisos ARIA y activación admin (25/02/2026)

### v2.58.0 — 10 mejoras de inteligencia ARIA (25/02/2026)
- 🔍 **Fuzzy search**: búsqueda tolerante a typos con Levenshtein + substring matching
- 🧠 **Smart cache**: normalización semántica de claves + limpieza automática (>30 entradas)
- 🔄 **Fallback auto-expand**: busca en TODAS las máquinas si 0 resultados iniciales
- 📊 **Resumen diario ejecutivo**: briefing automático al abrir chat (1x/día/usuario)
- 📝 **Wizard multi-turno**: barra de progreso visual para crear incidencias (4 campos)
- 📋 **Copiar mensaje**: botón clipboard en cada respuesta de ARIA
- 🏷️ **Data source badge**: indicador de fuentes de datos consultadas
- 🕐 **Búsquedas recientes**: dropdown con historial (max 8) al enfocar input
- 📊 **Tablas mejoradas**: renderizado HTML de tablas markdown
- ⚡ **Slash commands**: 9 comandos rápidos (/repuestos, /incidencias, /equipos, /resumen, /preventivo, /sensores, /falla, /gantt, /ayuda)

### v2.57.0 — Sugerencias contextuales ARIA (25/02/2026)
- 💡 **Chips de sugerencia**: sugerencias clickeables debajo de cada respuesta de ARIA
- 🏷️ Tag `[SUGERENCIAS]` automático en respuestas del LLM
- 🧹 Limpieza de tags durante streaming

### v2.48.64 - Navegación acordeón por categoría (20/02/2026)
- 🏢 **Acordeón vertical**: cada categoría (Máquinas Principales, Motores y Bombas, Cintas Transportadoras) es una sección colapsable.
- 🎨 **Tarjetas de máquina**: al expandir una categoría, los equipos se muestran como cards responsivas con color, nombre y conteo de repuestos.
- 📦 **Subcategorías integradas**: sub-secciones con separador visual dentro de cada categoría expandida.
- ⚡ **Selección directa**: click en tarjeta selecciona máquina y muestra sus repuestos debajo.
- 📱 **Grid responsivo**: 2 cols móvil → 6 cols desktop.
- 🧹 **Dashboard limpio**: eliminados tabs horizontales de categoría y pills de máquinas.

### v2.48.63 - Repuestos: catálogo puro sin inventario (20/02/2026)
- 🧹 **Eliminación sistema de tags**: removido completamente useTags, TagSelector y RepuestoHistoryModal.
- 📦 **Modelo simplificado**: Repuesto ahora usa `cantidadPorMaquina` y `ubicacionEnPlanta` en lugar de stock/solicitudes/tags.
- 📊 **KPIs de catálogo**: dashboard muestra total repuestos, con ficha técnica, con foto/manual y valor referencial.
- 📥 **Import simplificado**: ImportRepuestosModal solo modo catálogo (sin modo cantidades+tag).
- 📤 **Export limpio**: ExportReportModal sin referencias a tags.
- 🔍 **Búsqueda mejorada**: incluye código fabricante y ubicación en planta.
- 🗑️ **-1938 líneas eliminadas**: reducción masiva de complejidad del módulo.

### v2.48.33 - Gráfico con zonas de alerta temperatura/humedad (17/02/2026)
- 📊 **Selector de modo**: doble eje, solo temperatura o solo humedad.
- 🟡 **Zonas de advertencia**: bandas amarillas/cyan con transparencia al superar umbrales warn.
- 🔴 **Zonas de peligro**: bandas rojas/azules con transparencia al superar umbrales crit.
- 📏 **Líneas de umbral**: punteadas con etiquetas numéricas en los 4 límites.

### v2.48.32 - Firmware: onDisconnect automático en RTDB (17/02/2026)
- 📡 **onDisconnect en ESP32**: el firmware registra automáticamente `online: false` en Firebase RTDB al perder conexión WiFi/Firebase.
- 🔌 **Soporte dual**: se registra para `devices/{id}/online` y `sensors/{equipmentId}/online`.
- 🔐 **Auth via REST API**: usa `Firebase.getToken()` y endpoint `.onDisconnect.json`.

### v2.48.31 - Consistencia online en Sensores IoT (17/02/2026)
- 🎯 **KPI online consistente**: el contador superior de `Sensores IoT` ahora usa frescura real y no el booleano online crudo.
- 📶 **WiFi principal sin falso conectado**: el bloque cambia entre `Conectado` y `Configurada` según frescura del dispositivo.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.30 - Estado fresco consistente en pestaña Sensores (17/02/2026)
- 🧭 **Online real por frescura**: la vista `Sensores` ahora decide `Online` con `lastSeen` y `sendInterval`, evitando mostrar online cuando el equipo dejó de reportar.
- 🔁 **Estado unificado en toda la pantalla**: lista de dispositivos, telemetría y bloque de emparejar usan la misma regla de frescura.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.29 - Fix de seguimiento en tiempo real del gráfico (17/02/2026)
- 🔄 **Vista viva restaurada**: el gráfico vuelve a seguir automáticamente las últimas lecturas del ESP32 en RTDB según el intervalo configurado.
- ↔️ **Zoom/pan sin congelar la operación**: el modo histórico se activa solo al interactuar y al volver al rango total se recupera el seguimiento automático.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.28 - Zoom horizontal en gráfico de sensores (17/02/2026)
- 🔎 **Zoom temporal con rueda**: la gráfica del panel técnico permite acercar/alejar horizontalmente sobre las muestras.
- ↔️ **Pan lateral con Shift+rueda**: navegación del histórico visible manteniendo hover y lectura temporal.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.27 - Gráfico interactivo con hover e intervalo (17/02/2026)
- 📊 **Lectura temporal con mouse hover**: al pasar el cursor por la curva se muestra fecha/hora exacta y valores de temperatura/humedad del punto seleccionado.
- ⏱️ **Actualización ligada al intervalo configurado**: el panel muestra el `sendInterval` activo del dispositivo y el tiempo estimado para la próxima muestra.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.26 - Fix 404 de modulepreload en GitHub Pages (17/02/2026)
- 🧯 **Preloads conflictivos eliminados**: desactivado `modulePreload` en build para evitar `404` de requests automáticos a chunks en caché.
- 🌐 **Consola limpia en producción**: mitigados los errores `GET ... net::ERR_ABORTED 404` en líneas 34–36 del HTML publicado.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.25 - Fix 404 de chunks en GitHub Pages (17/02/2026)
- 🛠️ **Build con nombres estables**: configuración de Vite para generar `assets` sin hash cambiante y reducir errores `404` por desalineación de caché.
- 🌐 **PWA más estable en despliegue**: mitigado el `net::ERR_ABORTED 404` observado al cargar bundles en producción.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.24 - Gráfico de cambios del sensor en panel técnico (17/02/2026)
- 📈 **Tendencia visible por dispositivo**: cada tarjeta del `Panel Técnico de Sensores` ahora muestra un gráfico compacto con cambios recientes de temperatura y humedad.
- 🔄 **Datos en tiempo real desde RTDB**: el gráfico consume lecturas recientes por equipo asignado para reflejar variaciones operativas sin salir del panel.
- 🧭 **Lectura rápida en campo**: se agregaron leyenda y estado de disponibilidad cuando no hay historial suficiente.
- ✅ **Cierre estándar de versión**: bump y sincronización de artefactos de versionado según flujo oficial.

### v2.48.23 - ESP32 estable sin USB + OTA remota + guías operativas (16/02/2026)
- 🔧 **Captura ESP32 estabilizada**: se evitó reinicio por memoria en arranque RTDB y se validó publicación continua de temperatura/humedad sin USB.
- 🌐 **OTA remota pull habilitada**: firmware preparado para buscar manifiesto y actualizarse desde publicación central (sin requerir misma WiFi del PC).
- 📚 **Documentación operativa completa**: alta manual de nuevos ESP32 desde cualquier PC + prueba rápida inicial para LOGO cableado.
- ✅ **Cierre de release sincronizado**: versión alineada y verificada en archivos de versión y despliegue.

### v2.48.22 - Panel técnico de sensores + integración LOGO documentada (16/02/2026)
- 📟 **Nuevo panel técnico rápido**: vista `sensors/monitor` para operación diaria con KPIs y foco en estado de dispositivos.
- 🧭 **Acceso directo optimizado**: disponible desde menú lateral, botón en `Sensores IoT` y CTA sticky móvil.
- 🔌 **Contrato de integración LOGO listo**: guía publicada para publicar telemetría Siemens LOGO en el esquema RTDB compatible con la PWA.
- ✅ **Cierre de release sincronizado**: versionado y documentación alineados + revisión de Problems en VS Code sin errores activos.

### v2.48.21 - Deploy Pages estable + timeline compacto (16/02/2026)
- 🛡️ **Deploy sin bucle/cancelación cruzada**: ajustes de concurrencia y retry acotado en workflow de GitHub Pages.
- ⏱️ **Polling con límites reales**: timeout, error_count y reporting_interval para evitar espera indefinida en `actions/deploy-pages`.
- 🧭 **Timeline con más área útil**: compactación del bloque superior (proyecto/KPIs/controles) para priorizar la visualización del gráfico.

### v2.48.20 - Zoom y alineación corregidos en timeline Gantt (15/02/2026)
- 🧭 **Zoom Día/Semana/Mes funcional**: la escala ahora modifica visualmente el timeline incluso con pocas jornadas.
- 📐 **Fila y barra alineadas**: sincronización vertical entre tabla y timeline para mantener correspondencia exacta.
- 🧱 **Cabecera consistente**: ajuste de altura para eliminar desfase visual en el inicio de filas.

### v2.48.19 - Visor seguro de evidencia en Gantt (15/02/2026)
- 🔒 **Sin redirección externa**: fotos de comentarios se visualizan dentro de la app.
- 🔍 **Zoom/Pan integrado**: visor ampliado con acercar, alejar, restablecer y arrastre.
- 🧭 **Cobertura en todo Gantt**: aplica al historial de evidencia en Timeline y en pestaña `Tareas`.

### v2.48.18 - Hotfix deploy y errores VS Code (15/02/2026)
- 🧯 **TypeScript Gantt corregido**: resuelto error de índice `undefined` en mapeo de días de semana.
- 🧱 **Compilación restaurada**: import `orderBy` reintroducido en servicio Gantt para build CI.
- ✅ **Problemas de VS Code limpiados**: vista `Problems` y pipeline de deploy quedan consistentes.

### v2.48.17 - Notas históricas editables y robustez de seguimiento (16/02/2026)
- 🧾 **Notas multilinea**: campo de comentario en `textarea` para registrar avances con saltos de línea reales.
- ✏️ **Historial editable**: ahora se pueden editar notas previas (texto, `%` reportado y horas reales).
- 📷 **Evidencia en edición**: permite quitar fotos existentes y adjuntar nuevas manteniendo tope de 5 por nota.
- 🧠 **Flujo más estable**: mejoras para evitar errores de IA y consulta de comentarios en producción.

### v2.48.16 - Parser operativo y autoajuste inteligente (15/02/2026)
- 🤖 **Lectura de comentarios**: detecta bloqueos operativos y ajusta estado de tarea automáticamente.
- 📅 **Fechas desde lenguaje natural**: interpreta `jueves` y `dd/mm` para actualizar fecha fin cuando corresponde.
- ✨ **IA Grok autoaplicable**: si no hay `%` manual, aplica sugerencia IA salvo señales de bloqueo.
- ⚙️ **Automatización real del seguimiento**: texto + evidencia + IA ahora repercuten en planificación y avance.

### v2.48.15 - Avance editable + notas/fotos + IA en timeline (15/02/2026)
- 📝 **Edición directa desde Avance**: clic en `%` abre modal rápido por tarea.
- 📷 **Trazabilidad en sitio**: nota + evidencia fotográfica guardadas desde el mismo modal.
- ✨ **Grok integrado**: sugiere porcentaje según comentarios y permite aplicar de inmediato.
- ⏱️ **Tiempo autoajustable**: horas reales reportadas pueden extender fin de tarea automáticamente.

### v2.48.14 - Seleccionar todo el filtro actual (15/02/2026)
- ✅ **Nuevo botón Seleccionar filtro** en ubicación múltiple para admin.
- ⚡ **Cobertura completa del resultado**: marca en bloque todas las tareas filtradas, no solo la página visible.
- 🧭 **Operación más ágil**: reduce clics cuando varias tareas comparten misma máquina/ubicación.

### v2.48.13 - Ubicación masiva y seguridad extra al eliminar (15/02/2026)
- 📌 **Asignación de ubicación a múltiples tareas**: admin puede seleccionar varias tareas y aplicar una misma ubicación en lote.
- ☑️ **Checkbox por tarea**: selección rápida dentro del listado de la pestaña `Tareas`.
- 🧭 **Selector jerárquico encadenado**: mismo patrón de ubicación por niveles, ahora para operación masiva.
- 🛡️ **Eliminar más seguro**: botón `Eliminar` del diálogo se activa tras 1 segundo para evitar doble clic accidental.

### v2.48.12 - Confirmación con modal UI en eliminación (15/02/2026)
- 🧩 **Dialog nativo**: la `X` roja usa modal del sistema con `Cancelar / Eliminar`.
- 🏷️ **Tarea identificada**: se muestra el título de la tarea dentro del mensaje de confirmación.
- ✅ **UX más consistente**: se evita `window.confirm` y se unifica el patrón visual con el resto de la app.

### v2.48.11 - Confirmación de borrado en X roja (15/02/2026)
- 🛡️ **Confirmación previa**: la `X` roja del timeline solicita validación antes de eliminar.
- 🧾 **Contexto visible**: el mensaje muestra el título de la tarea a borrar.
- ✅ **Flujo rápido conservado**: se mantiene eliminación directa desde tabla, con menor riesgo de error humano.

### v2.48.10 - Buscador único y borrado rápido admin (15/02/2026)
- 🔎 **Un solo filtro timeline**: búsqueda global en área, equipo, tarea y responsable.
- ❌ **Eliminar más fácil**: botón `X` rojo por fila al lado de `Δ Plan (h)` para admins/usuarios con permiso de eliminar.
- ℹ️ **Columna aclarada**: `Δ Plan (h)` indica diferencia de horas respecto al baseline.

### v2.48.09 - Texto más legible y dependencias más claras (15/02/2026)
- 🔤 **Mejor lectura de etiquetas**: `título · %` con tamaño mayor, mayor peso y sombra suave.
- 🎨 **Dependencias por tipo**: `FS/SS/FF/SF` con color semántico para distinguir enlaces.
- 🧷 **Doble trazo en líneas**: halo tenue + línea principal para separar visualmente de la grilla.
- ↪️ **Back-links más limpios**: ruta ortogonal con desvío lateral en enlaces hacia atrás.

### v2.48.08 - Barras al doble de alto en timeline (15/02/2026)
- 📏 **Altura 2x en eje Y**: barra principal en `h-6` (doble de la base `h-3`).
- 👀 **Mayor legibilidad real**: texto interno más visible al aprovechar el alto completo.
- 🎯 **Geometría ajustada**: handles, anclas y centro de dependencias alineados al nuevo espesor.

### v2.48.07 - Barras más legibles en timeline (15/02/2026)
- 🧱 **Mayor altura de barra**: mejor aprovechamiento del carril y lectura más cómoda.
- 🎯 **Texto con mejor contraste**: `título · %` ajusta foreground según rango de progreso.
- 🧲 **Anclas y handles más visibles**: mejora de precisión al enlazar dependencias y redimensionar.
- 📐 **Centro visual unificado**: líneas de dependencia alineadas al centro real de la barra.

### v2.48.06 - Progreso por rangos de color en timeline (15/02/2026)
- 🎨 **Semáforo de avance**: rojo 0-30%, amarillo 31-70%, verde 71-100%.
- ⚡ **Lectura operativa inmediata**: estado de cada tarea visible en un vistazo.
- 🏷️ **Leyenda alineada**: referencias visuales incorporadas en pie del timeline.

### v2.48.05 - Mini barra de progreso en tareas de timeline (15/02/2026)
- 📊 **Progreso visual integrado**: cada barra muestra relleno interno según porcentaje real de avance.
- 🧠 **Mejor lectura operativa**: texto `título · %` + señal visual simultánea sobre la misma barra.
- 🏷️ **Leyenda actualizada**: separación clara entre fondo de barra y avance efectivo.

### v2.48.04 - Flechas robustas y barra informativa en timeline (15/02/2026)
- 🏹 **Dependencias mejoradas**: trazado ortogonal más estable cuando origen y destino no coinciden en inicio/fin.
- ↩️ **Conexiones hacia atrás claras**: la línea se dobla e ingresa al destino sin corrimiento visual.
- 📝 **Texto en barra**: muestra `título · %` directamente sobre la barra de tarea.
- 💬 **Hover enriquecido**: estado, responsable, fechas y número de dependencias en cada barra.

### v2.48.03 - Timeline limpio + jerarquía 7 niveles (15/02/2026)
- 🧼 **Menos ruido en timeline**: la carga por técnico se mueve a una pestaña dedicada.
- ➕ **Nueva tarea desde timeline**: botón directo para ir a creación sin salir del flujo.
- 🧭 **Ubicación jerárquica completa**: selección secuencial de 7 niveles (`Área` a `Elemento`) en creación y edición rápida.
- 📋 **Lista más clara**: visualización de solo último nivel jerárquico en tareas.

### v2.48.02 - Convenciones oficiales de release y commit (15/02/2026)
- 📏 **Estándar institucionalizado**: cada mejora cierra con versionado + validación + commit + push.
- 🧾 **Formato único de commit release**: `release: vX.Y.Z <resumen-corto>`.
- ✅ **Guías unificadas**: actualización de `VERSION_CHECKLIST.md` y `DEVELOPMENT_GUIDELINES.md` con el flujo oficial.
- 🔁 **Recuperación documentada**: manejo de `non-fast-forward` con `pull --rebase` antes de reintentar publicación.

### v2.48.01 - Limpieza visual y edición por rol en Gantt (15/02/2026)
- 🧼 **Menos ruido visual**: removido el bloque de texto introductorio en timeline para dejar foco en operación.
- 🧭 **Ubicación compacta**: área mostrada en formato resumido (sin raíz completa), priorizando lectura rápida.
- 🔐 **Permisos claros por rol**: edición de título/área/equipo habilitada solo para `admin` y `supervisor`.
- 🔎 **Dependencias rápidas mejoradas**: buscador de predecesora, etiquetas explícitas para `FS/SS/FF/SF` y ayuda hover de `Lag`.
- 💬 **Hover en truncados**: tooltips en tabla/listado para ver texto completo sin agrandar celdas.

### v2.48.00 - Dependencias visuales con flecha y codo (14/02/2026)
- 🧭 **Dirección explícita**: flecha visible en líneas de dependencia para entender rápidamente de dónde sale y a dónde llega.
- ↪️ **Ruta más legible**: trazado en codo/curva para dependencias guardadas y en preview de arrastre.
- 🎯 **Más parecido al demo**: conexión visual entre barras alineada con referencia tipo GanttPRO.

### v2.47.99 - Hotfix deploy: Type check Gantt (14/02/2026)
- 🧯 **Fix TypeScript en CI**: corregidos errores de tipado en `GanttPlannerPage` detectados por `tsc --noEmit`.
- ✅ **Pipeline validado**: comprobado localmente con `type-check + lint + build`.
- 🚀 **Despliegue estabilizado**: este release apunta a destrabar los runs fallidos en GitHub Actions.

### v2.47.98 - Fix deploy + vista compacta en Tareas (14/02/2026)
- 🚑 **Deploy estable**: corregido warning de hooks que afectaba la etapa `Lint` en GitHub Actions.
- 🗂️ **Modo compacto en Tareas**: toggle ON/OFF para mostrar más tarjetas en la misma pantalla.
- ⚡ **Operación más rápida**: se mantiene foco en información clave y se expande edición al seleccionar tarea.

### v2.47.97 - Orden visual de Configuración y Tareas (14/02/2026)
- 🧹 **Filtros agrupados en Tareas**: bloque único más limpio para búsqueda, filtros y orden.
- 🧭 **Configuración guiada**: flujo sugerido y subtítulos operativos para cada bloque.
- 🧩 **Formulario de creación estructurado**: campos organizados en rejilla para lectura y carga más rápida.

### v2.47.96 - Guía contextual FS/SS/FF/SF en modo dependencia (14/02/2026)
- 📘 **Guía rápida visible**: al activar `D` se muestra el significado operativo de `FS`, `SS`, `FF` y `SF`.
- 🧭 **Decisión más clara**: ayuda a elegir el tipo correcto sin cambiar de pantalla.
- 🧼 **Contextual y limpia**: aparece solo en modo dependencia y se oculta al desactivarlo.

### v2.47.95 - Etiqueta flotante de tipo en drag de dependencia (14/02/2026)
- 🏷️ **Tipo en vivo**: muestra `FS/SS/FF/SF` junto al cursor mientras arrastras la dependencia.
- 👁️ **Verificación previa**: permite confirmar la relación antes de soltar.
- ⚡ **Menos fricción**: acelera creación de enlaces correctos en timelines con alta densidad.

### v2.47.94 - Resaltado de anclas destino en drag de dependencias (14/02/2026)
- 🎯 **Destino válido visible**: durante el arrastre se resaltan las anclas posibles de conexión.
- 🧲 **Snap reforzado**: el target activo se marca con mayor contraste para confirmar el punto de enlace.
- ✅ **Conexión más precisa**: reduce errores al crear dependencias en timelines con muchas tareas.

### v2.47.93 - Modo dependencia con tecla D (14/02/2026)
- ⌨️ **Toggle rápido**: tecla `D` para activar/desactivar modo de creación de dependencias.
- 🎯 **Menos errores de interacción**: anclas solo visibles en modo dependencia para evitar choques con drag/resize.
- 👀 **Estado claro**: botón de cabecera `Dependencias (ON/OFF · D)` con feedback inmediato.

### v2.47.92 - Dependencias por mouse con hover explicativo (14/02/2026)
- 🖱️ **Drag de dependencia**: conectar tareas arrastrando desde inicio/fin de una barra hacia inicio/fin de otra.
- 🧠 **Tipo automático**: cálculo automático de `FS`, `SS`, `FF` o `SF` según anclas seleccionadas.
- 💬 **Hover informativo**: explicación en lenguaje natural con ejemplo A/B usando nombres reales de tareas.

### v2.47.91 - Editor visual de dependencias (14/02/2026)
- 🧩 **Dependencias en modal**: edición rápida de predecesora, tipo (`FS/SS/FF/SF`) y `lag`.
- 🔁 **Alta/baja directa**: creación y eliminación de dependencias desde timeline sin cambiar de pantalla.
- ⚙️ **Operación más ágil**: ajustes de secuencia en el mismo flujo de edición de fechas y responsable.

### v2.47.90 - Carga por técnico + variación baseline (14/02/2026)
- 📊 **Histograma por responsable**: vista de carga de trabajo por técnico en tareas visibles del timeline.
- 📐 **Columna Δ Plan**: comparación directa de duración real vs baseline en cada tarea.
- ⚡ **Priorización más rápida**: señal de desvío sin abrir modales ni detalle adicional.

### v2.47.89 - Dependencias avanzadas + calendario hábil + snap (14/02/2026)
- 🔗 **Auto-scheduling completo**: Propagación con dependencias `FS/SS/FF/SF` y `lag` en horas.
- 📅 **Calendario laboral básico**: opción de trabajar en modo `Solo días hábiles (L-V)`.
- 🧲 **Snap configurable**: control de precisión del drag (`auto`, `1h`, `6h`, `12h`, `1 día`).
- 🧾 **Tooltip de arrastre**: visualización en vivo de inicio/fin y duración para ajustes más seguros.

### v2.47.88 - Duración planificada y tiempo real técnico (14/02/2026)
- ⏱️ **Duración por horas o días**: el modal rápido permite aplicar duración usando unidad de tiempo según necesidad operativa.
- 🧑‍🔧 **Tiempo real reportado**: cada comentario de tarea puede registrar cuántas horas se demoró realmente el técnico.
- 📈 **Auto-extensión de barra**: si el tiempo real supera lo planificado, la tarea amplía su ventana temporal automáticamente.
- 🗓️ **Mejor contraste diario**: timeline con demarcación diaria reforzada para leer avance día a día.

### v2.47.87 - Editor de tarea en modal PWA (14/02/2026)
- 🪟 **Modal en vez de panel fijo**: la edición rápida ya no ocupa espacio permanente en pantalla.
- 🖱️ **Apertura contextual**: doble clic en tarea/barra o acción explícita para editar cuando realmente se requiere.
- 📱 **Mejor en PWA**: diálogo compacto y adaptable para operación en pantallas reducidas.

### v2.47.86 - Doble clic para edición rápida (14/02/2026)
- ⚡ **Open rápido**: doble clic en fila/barra del timeline abre edición de la tarea.
- 🎯 **Foco inteligente**: el input de inicio toma foco automáticamente para editar fecha/hora sin pasos extra.

### v2.47.85 - Interacción por tarea en timeline (14/02/2026)
- 🔎 **Búsqueda por contexto**: filtros por área/equipo/tarea en la vista timeline.
- 🧩 **Edición rápida**: cambio directo de fechas, horas y responsable para la tarea seleccionada.
- 🖱️ **Selección simple**: clic en fila o barra para operar cada tarea más rápido.

### v2.47.84 - Modo enfoque Gantt (14/02/2026)
- 🎯 **Enfoque por módulo**: Nuevo botón para ocultar sidebar solo en `Gantt` y ganar ancho de trabajo.
- 🧭 **Menú por proximidad**: Peek lateral al acercar mouse al borde izquierdo en escritorio.
- 💾 **Preferencia persistente**: El estado del modo enfoque se mantiene entre sesiones.

### v2.47.83 - Interacción y legibilidad del timeline (14/02/2026)
- 🧩 **Rango por página**: El timeline ahora se ajusta a la página visible para que las barras no queden comprimidas.
- ↔️ **Splitter horizontal**: Puedes arrastrar el divisor entre tabla y timeline para ver más detalle donde lo necesites.
- 🖱️ **Interacción más estable**: Dependencias con `pointer-events` desactivados para no bloquear drag/resize de tareas.

### v2.47.82 - Forzar refresh cliente + timeline demo activo (14/02/2026)
- 🔄 **Refresh de cliente**: Bump de versión para activar detección de actualización y recarga controlada en sesiones abiertas.
- 🧭 **Timeline demo operativo**: Se conserva en productivo la vista de timeline alineada al mock aprobado.

### v2.47.81 - Pestañas en Planificador + preferencia persistente (14/02/2026)
- 🗂️ **Navegación por pestañas**: Planificador dividido en `Configuración`, `Tareas` y `Timeline`.
- 📍 **Timeline por defecto**: Apertura inicial en vista temporal para seguimiento inmediato.
- 💾 **Preferencia por usuario**: Se recuerda la última pestaña abierta y se restaura al reingresar.

### v2.47.80 - Ajuste UX Gantt: Área y Equipo primero (14/02/2026)
- 🧭 **Orden operativo mejorado**: En timeline y listado ahora se muestra `Área · Equipo` antes de `Tarea`.
- 👀 **Lectura por contexto de planta**: Facilita revisar bloques por zona/equipo sin abrir cada detalle.
- ✅ **Demo alineada**: Propuesta HTML actualizada con columnas `Área`, `Equipo`, `Tarea` para validación visual.

### v2.47.79 - Timeline editable con drag/resize (13/02/2026)
- 🖱️ **Drag de tareas**: En timeline puedes arrastrar barras para mover inicio/fin manteniendo duración.
- ↔️ **Resize por handles**: Ajuste de inicio/fin con tiradores laterales para redefinir duración de tarea.
- 🔗 **Dependencias FS vivas**: Al cambiar una tarea, se propagan automáticamente sucesoras `FS` para conservar secuencia.
- 📐 **Edición visual operativa**: Planificación más natural sin entrar a formularios para cada ajuste de fechas.

### v2.47.78 - Timeline Gantt profesional (13/02/2026)
- 📏 **Escala de timeline**: Selector `Día / Semana / Mes` para adaptar la densidad de planificación.
- 📍 **Línea de hoy**: Marcador vertical para ubicar el estado actual del proyecto en la línea temporal.
- 🧭 **Baseline vs Real**: Cada tarea muestra barra base planificada y barra de ejecución real superpuesta.
- 💾 **Baseline persistente**: Nuevos campos `baselineStartDate` y `baselineEndDate` guardados desde creación/importación.

### v2.47.77 - Gantt técnico con avance IA y evidencia (13/02/2026)
- 👷 **Avance por técnico**: El responsable asignado ahora puede actualizar directamente el `%` real de resolución de cada tarea.
- 🤖 **Sugerencia IA (Grok)**: Se estima `%` sugerido a partir de comentarios operativos recientes y puede aplicarse con un clic.
- 📸 **Comentarios con fotos**: Seguimiento por tarea admite evidencia gráfica (imágenes) junto al comentario.
- 🧾 **Trazabilidad de avance**: Se guarda `aiSuggestedProgress` en tarea y `% reportado` en comentarios para auditoría operativa.
- 🔐 **Storage preparado**: Ruta dedicada para fotos de comentarios Gantt incorporada en reglas de Storage.

### v2.47.76 - Gantt por área/equipo jerárquicos (13/02/2026)
- 🧭 **Área + Equipo visibles**: El listado muestra `Área · Equipo · Fechas` para cada tarea.
- 🗂️ **Filtro por área**: Nuevo filtro en Gantt para ordenar y navegar tareas por jerarquía real de planta.
- 🛠️ **Creación guiada**: Formulario con selector de `Área` (jerarquía) y `Equipo` filtrado por área.
- 📥 **Importación Excel mejorada**: Mapea columna `Area` al nodo jerárquico oficial si no encuentra match directo de equipo.

### v2.47.75 - Hotfix crash Gantt SelectItem (13/02/2026)
- 🧯 **Crash crítico resuelto**: Se corrige el error Radix `A <Select.Item /> must have a value prop that is not an empty string`.
- 🆔 **ID de tareas robusto**: En lectura Gantt se prioriza `doc.id` sobre cualquier campo `id` persistido en documento.
- 🧹 **Persistencia limpia**: En creación/actualización de tareas Gantt ya no se persiste `id` en payload.

### v2.47.74 - Fix importación Gantt (13/02/2026)
- 🛡️ **Firestore-safe**: `createGanttTask` y `updateGanttTask` limpian campos `undefined` (incluye objetos/anidados) antes de guardar.
- 📥 **Import Excel robusta**: Soporte de alias `descipacion` en parser y fallback de descripción segura en carga masiva.
- ✅ **Error resuelto**: elimina fallo `Function addDoc() called with invalid data` al importar lista simplificada (`Area/Equipo/Tarea`).

### v2.47.73 - Fix permisos Gantt + importación Excel (13/02/2026)
- 🔐 **Permisos Gantt**: Nuevas reglas Firestore para `ganttTasks` y `ganttTaskComments` (lectura/escritura para usuarios activos según rol/propiedad).
- 📤 **Importación Excel en Gantt**: Nuevo bloque en Planificador para cargar `.xlsx/.xlsm/.xls`, previsualizar filas válidas/errores e importar tareas en lote.
- 🧭 **Mapeo jerárquico**: La importación intenta vincular tarea a equipo por nombre/código y usar `hierarchyPath`/área para mejorar asignación en timeline.

### v2.47.22 - Soporte Puerta 0 en carga Grader (11/02/2026)
- 🚨 **Archivos Puerta 0**: Ahora se pueden cargar archivos "Puerta 0" junto con Pieza-Pieza.
- 🔍 **Datos P0 reales**: Los registros de Punto Cero provienen del archivo dedicado con errores reales (No leído por fotocélula, Fuera de límites, etc.).
- 🎨 **UI actualizada**: Textos, banners y validaciones adaptados para aceptar ambos tipos de archivo.
- 📊 **Conteo P0**: Se muestra cantidad de registros P0 en la lista de archivos cargados.

### v2.47.20 - Calendario inline + UI compacta Grader (11/02/2026)
- 📅 **Calendario inline**: Calendario visual con cuadrícula mensual integrado en la página de carga de archivos.
- 🎨 **UI compacta**: Zona de carga reducida, banner informativo inline, sección turno objetivo más limpia.
- 🔧 **Solo 2 turnos**: Eliminado "Turno tarde" — solo Turno día y Turno noche para Grader.
- 📐 **Layout mejorado**: Botón continuar y estado en una fila, espaciado reducido.

### v2.47.16 - Fix deploy (10/02/2026)
- 🧯 **Repuestos**: Helpers y tipos restaurados para build en CI.

### v2.47.15 - Lint limpio (10/02/2026)
- ✅ **Hooks**: Dependencias estabilizadas y funciones memoizadas.
- 🧰 **Utilidades**: Ajustes menores de tipado/JSX.

### v2.47.14 - Ajustes de Hooks (10/02/2026)
- 🧹 **Calendario/Upload**: Dependencias de hooks estabilizadas y memo de carga de turnos.

### v2.47.13 - Fix VS Code (10/02/2026)
- 🧩 **Calendario**: Reparado JSX y hooks fuera del render.
- 🧭 **Horarios**: Ajustes de tipado y null checks en configuracion.

### v2.47.12 - Horarios configurables + cache correcto (10/02/2026)
- 🗓️ **Horarios de turnos**: Configuracion global de rangos por turno (dia/tarde/noche).
- 🔁 **Resumen diario limpio**: Al actualizar un archivo se invalida el resumen guardado.
- 🎯 **Auto-seleccion**: El calendario preselecciona el ultimo dia con uploads.
- 🔐 **Reglas Firestore**: Supervisores pueden invalidar `graderDailySummaries`.

### v2.47.11 - Turno tarde + reemplazo de uploads (10/02/2026)
- 🕒 **Turno tarde**: Disponible en carga, calendario y configuración de análisis.
- 🔁 **Reemplazo por turno**: Un nuevo archivo del mismo día/turno actualiza el último.
- 🧹 **Calendario limpio**: Se muestran solo los últimos archivos por día/turno.

### v2.47.10 - Resumen diario persistido (10/02/2026)
- 📊 **KPIs persistidos**: Resumen diario por turno guardado para evitar recalculo en calendario.
- 🟢 **Estado visible**: Indicador "Guardado/Calculado" para distinguir cache vs. nuevo calculo.
- 🔐 **Reglas Firestore**: Nueva colección `graderDailySummaries` habilitada.

### v2.47.0 - Upload pieza-pieza simplificado + Rangos editables + Drill-down P0 (09/02/2026)
- 📤 **Upload simplificado**: Solo archivos Pieza-Pieza requeridos, eliminado checklist de otros tipos
- 🔄 **Multi-upload por turno**: Agrega varios archivos pieza-pieza durante el día; detección automática del rango de turno
- ⚖️ **Rangos de peso editables**: Sección colapsable en Gates Config para personalizar min/max gramos por calibre
- 🔍 **Custom weight ranges en motor**: El motor de análisis usa rangos personalizados cuando están configurados
- 📊 **Drill-down P0**: Click en cualquier causa del Punto Cero para ver registros individuales pieza-pieza
- 🔧 **Todas las causas P0 visibles**: Las 6 categorías de causa siempre aparecen (incluyendo "No leído por fotocélula")
- 🔐 **Firebase rules fix**: Corregido `isValidDocSize()` para plantillas de gates y sesiones de análisis

### v2.46.1 - Clasificación P0 inteligente + Rangos de peso + Persistencia de archivos (09/02/2026)
- 🎯 **Clasificación P0 inteligente**: Re-clasifica "Fuera de límites" → "Fuera de rango" cuando no hay gate activo para el calibre
- 🔍 **No leído por fotocélula**: Piezas sin peso detectadas como "No leído por fotocélula" en vez de "Fuera de límites"
- ⚖️ **Rangos de peso en Gates**: Nueva columna "Rango (g)" muestra min–max gramos por calibre en configuración de gates
- 🔄 **Persistencia de archivos**: Los archivos Excel cargados persisten al navegar entre pasos del wizard sin necesidad de recargar
- 🐛 **Fix tabla pivote**: Lógica P0 consistente en tabla jerárquica Error×Calidad×Calibre

### v2.46.0 - Tooltips ricos + Modo día/noche + UI refinada (09/02/2026)
- 💡 **InfoTooltip v2**: Tooltips con título, fórmula estadística y ejemplo contextual
- 📐 **18 tooltips enriquecidos**: Fórmulas completas para Mediana, σ, CV, HHI, IQR, Sesgo, Curtosis, etc.
- 🌗 **Modo día/noche**: Toggle Sol/Luna en header del dashboard Grader con CSS `.grader-light-mode`
- 🧹 **UI limpia**: Eliminados gráfico de barras P0 redundante, tabla "Desglose por Error Original" y tablas de distribución duplicadas
- 🎨 **getTooltipProps()**: Función spread-ready para props de tooltips en cualquier componente

### v2.45.0 - Motor estadístico avanzado + Dashboard 7 tabs (09/02/2026)
- 📊 **graderStats.ts**: Motor estadístico completo (Mediana, σ, CV%, Sesgo, Curtosis, IQR, HHI, cuartiles)
- 💡 **graderTooltips.ts**: Diccionario de tooltips con ayuda contextual por indicador
- 🏗️ **InfoTooltip**: Componente flotante con icono ⓘ para ayuda contextual
- 📈 **7 tabs en dashboard**: Resumen, Gates, Distribución Calibre, Distribución Peso, Calidad, Punto Cero, Insights
- 🔍 **Insights automáticos**: Detección de concentración (HHI), alertas de Punto Cero, variabilidad de peso
- 📊 **Gráficos ChartJS**: Doughnut distribución, barras por gate, línea de pesos, stacked calidad
- 🧮 **Tipos extendidos**: GraderStats, CalibrationInsight, DistributionAnalysis, QualityAnalysis
- 📥 **Export mejorado**: Estadísticas avanzadas incluidas en Excel y PDF

### v2.44.4 - Fix TypeScript never[] inference (09/02/2026)
- 🐛 **Fix compilación**: Corregido error `never[]` en inferencia TypeScript en graderAnalytics.ts
- 🔧 **Tipos explícitos**: Añadidos tipos explícitos a arrays inicializados vacíos

### v2.44.3 - Pivote Error×Calidad×Calibre + fix Suspense (09/02/2026)
- 📊 **Tabla pivote Error×Calidad×Calibre**: Desglose jerárquico 3 niveles como pivot table Marelec
- 🔧 **Parser pieza-pieza autosuficiente**: Columna Error + inferencia inteligente de causa
- 🏷️ **Calibres HG**: Manejo prefijo HG (HG 2-4, HG 6-8) y "Fuera de Rango" como calibre
- 📥 **Export Excel**: Nueva hoja "Pivote Error×Cal×Calibre" jerárquica con subtotales
- 📄 **Export PDF**: Tabla pivote completa en reporte
- 🐛 **Fix React error #426**: Suspense boundary global + en MainLayout Outlet

### v2.43.1 - FIX: Permisos Firebase y estabilidad (08/02/2026)
- 🔐 **Firebase Rules verificadas**: Permisos públicos para annotations, dimensions y materialOverrides confirmados.
- 🐛 **Fix ErrorBoundary**: Eliminado import no usado de React.
- 🐛 **Fix annotations3d**: Corregido acceso posiblemente undefined en snap.docs.
- 🔧 **Fix DimensionsTool**: Hooks condicionales movidos antes de early returns.
- 🔧 **Fix regex lint**: Eliminados escapes innecesarios en regex.

### v2.43.0 - FEATURE: Anotaciones y Pines 3D (08/02/2026)
- 📍 **Anotaciones 3D**: Nuevo sistema de "Pines" para marcar incidencias directamente sobre el modelo.
- 🎨 **Priorización Visual**: Código de colores para pines según prioridad (Rojo/Ámbar/Azul) o estado (Verde=Resuelta).
- 💬 **Badges y Títulos**: Indicadores visuales y etiquetas flotantes al pasar el mouse.
- 🛠️ **Integración en Visor**: Nuevo modo "Anotación" en la barra de herramientas.
- 🖱️ **Interacción**: Detección precisa de clics ignorando elementos UI para colocación exacta.

### v2.42.0 - FEATURE: Sistema de Mediciones Avanzado (08/02/2026)
- 📏 **Distancia**: Medición lineal entre 2 puntos (existente, mejorado).
- 📐 **Área (m²)**: Polígono de 3+ puntos con relleno semitransparente verde, cierre manual.
- ⭕ **Circunferencia**: Círculo circunscrito por 3 puntos, muestra diámetro y circunferencia.
- 📦 **Volumen (m³)**: Bounding box entre 2 esquinas diagonales, wireframe rojo.
- 📏 **Selector de unidades**: mm / cm / m con sufijos automáticos (², ³).
- 🎨 **UI**: Selector de tipo de medición, botón "Cerrar polígono", deshacer punto.
- 🔄 **Retrocompat**: Cotas existentes (distance) siguen funcionando sin cambios.
- 🛠️ **Fix**: Corregidos 52 errores de TypeScript strict mode.

### v2.48.34 - BUGFIX: Resolución de Incidencias (07/02/2026)
- 🐛 **FIX CRÍTICO**: Corregido error al resolver incidencias ("Unsupported field value: undefined").
- 🛠️ **CORE**: Implementada limpieza automática de campos `undefined` antes de enviar a Firestore.
- 🛡️ **UI**: Añadido ErrorBoundary para prevenir pantallas negras en errores de renderizado.

### v2.48.33 - FEATURE: Flujo de Resolución y Cierre Técnico (06/02/2026)
- 🛠️ **WORKFLOW**: Nuevo estado intermedio **"Resuelta"**.
- 👷‍♂️ **Técnicos**: Ahora marcan la incidencia como **"Resuelta"** al finalizar trabajo (se envía notificación al supervisor).
- 👔 **Supervisores**: Realizan el **"Cierre Técnico"** validando la resolución.
- 🔔 **Notificaciones**: Avisos automáticos a supervisores cuando un técnico resuelve una incidencia.

### v2.48.32 - HOTFIX: Asignación Técnica (05/02/2026)
- 🐛 **FIX**: Corregido error crítico que impedía asignar incidentes (el evento de clic se pasaba como ID).
- 🔄 **UX**: La asignación ahora funciona correctamente al hacer clic en "Asignar Técnico".

### v2.45.7 - UI: Indicador de Proveedor Auth (01/02/2026)
- 📄 **UI**: Icono pequeño de correo (Google) aparece junto al nombre si la cuenta es Google.
- 🎯 **UX**: Facilita identificar qué usuarios usan cuenta Google.

### v2.45.6 - UI: Agregar Email en Sidebar (01/02/2026)
- 📧 **UI**: Ahora se muestra el correo electrónico debajo del nombre del usuario en el sidebar.
- 🎯 **UX**: Facilita la identificación rápida del usuario.

### v2.45.5 - UI: Admin Display Name (01/02/2026)
- 🎨 **UI**: El usuario admin ahora se muestra como "Admin" en el sidebar en lugar del nombre completo.
- 🔤 **UI**: Avatar del admin muestra iniciales "AD" en lugar de las iniciales del nombre.

### v2.45.4 - Debug Auth Logs (01/02/2026)
- 🔍 **Debug**: Agregados logs paso a paso en `signInWithGoogleToken` para trazar la ejecución:
  - `[Auth] 1. Creating credential object...`
  - `[Auth] 2. Signing in with credential to Firebase...`
  - `[Auth] 3. Firebase Auth success...`
  - `[Auth] 4. Fetching user profile...`

### v2.45.3 - Mejora UX Login & Auth Persistence (01/02/2026)
- ✨ **Feature**: Opción "Mantener sesión iniciada" (Switch on/off) en pantalla de login.
- 🔧 **Auth**: Configuración mejorada de Google Sign-In (`use_fedcm_for_prompt`, `itp_support`).
- 🚑 **Fix**: `ui_mode: 'popup'` explícito para intentar mitigar errores de COOP.
- 🔍 **Debug**: Logging mejorado en consola para errores de autenticación.

### v2.45.2 - Fix Auth & Permissions (01/02/2026)
- 🐛 **Fix Firestore**: `useMachines` prevenido de ejecutarse sin autenticación (evita error `Missing or insufficient permissions` en Login).
- 🔧 **Auth**: Documentación agregada sobre whitelist de orígenes en Google Cloud.
- 🧹 **Lint**: Corrección de `@ts-ignore` a `@ts-expect-error` en `auth.ts`.

### v2.45.1 - Fix Admin Permisos UI (01/02/2026)
- 🐛 **Fix**: Correcciones críticas en `PermissionsPage.tsx` que impedían el build.
- 🔧 **Types**: Corrección de tipado en `PermissionsMap` usando `APP_MODULES`.
- 🗑️ **Limpieza**: Eliminación de componentes UI no utilizados (Table, Tabs, etc.).

### v2.45.0 - Sistema de Permisos Dinámicos + Google Auth (31/01/2026)
- 🔐 **Login con Google**: Nuevo botón para autenticación con cuenta Google
- 🛡️ **Permisos Dinámicos**: Sistema completo de permisos configurables
  - Permisos por módulo (ver, crear, editar, eliminar, etc.)
  - Configuración por rol (Admin, Supervisor, Técnico, Usuario)
  - Override individual por usuario
  - Persistencia en Firestore con sincronización en tiempo real
- ⚙️ **Nueva pestaña Permisos** en Configuración para administrar accesos
- 📦 Nuevos archivos:
  - `types/permissions.ts` - Tipos de módulos y acciones
  - `services/permissions.ts` - CRUD de permisos en Firestore
  - `store/permissionsStore.ts` - Store Zustand con listeners realtime
  - `components/admin/PermissionsManagerV2.tsx` - UI de gestión
  - `scripts/seed-permissions.js` - Script para inicializar roles

### v2.44.2 - ETT Export: Formato Corregido (30/01/2026)
- 🔧 Fix: Removidas secciones incorrectas (Procedimientos, Análisis de Riesgos)
- ✅ Agregada sección "Imágenes de referencia" (fotos del área a intervenir)
- ✅ Agregada sección "Material Gráfico" (diagramas y documentos)
- 📄 Formato ahora coincide exactamente con documento original AquaChile

### v2.44.1 - ETT Export: Complete AquaChile Format (30/01/2026)
- 🔧 Fix: Exportación Word con 10 secciones exactas del formato AquaChile
- ✅ Sección 1: Encabezado corporativo (tabla 2x2)
- ✅ Sección 2: Tabla información principal (7 campos)
- ✅ Sección 3: Consideraciones previas (6 viñetas, primera en rojo)
- ✅ Sección 4: Especificación servicio + área intervención
- ✅ Sección 5: Materiales/equipos requeridos (tabla)
- ✅ Sección 6: SUMINISTROS - Parte de la oferta
- ✅ Sección 7: EQUIPOS Y HERRAMIENTAS - Responsabilidad contratista
- ✅ Sección 8: ASEO Y ENTREGA - Normas limpieza y protección alimentos
- ✅ Sección 9: Observaciones (si existen)
- ✅ Sección 10: BASES ADMINISTRATIVAS (9 puntos estándar)

### v2.44.0 - ETT Module: Technical Work Specifications with AI (30/01/2026)
- ✨ Feat: Módulo completo ETT (Especificaciones Técnicas del Trabajo)
- ✨ Feat: Formulario wizard con 6 tabs (General, Trabajo, Materiales, Procedimientos, Riesgos, Exportar)
- ✨ Feat: Integración con IA (Groq) para mejora automática de textos
- ✨ Feat: Botón "Mejorar con IA" en campos de texto con preview de mejoras
- ✨ Feat: Captura de voz con Web Speech API para descripción del trabajo
- ✨ Feat: Exportación a Word (.docx) con estilos profesionales
- ✨ Feat: Exportación a PDF con html2canvas + jsPDF
- ✨ Feat: CRUD completo de ETT con Firestore
- ✨ Feat: Sistema de estados (borrador, en_revisión, aprobada, completada, archivada)
- ✨ Feat: Ruta admin-only /admin/ett con lazy loading
- 🎨 UX: Diálogos dinámicos para agregar materiales, procedimientos y riesgos
- 🎨 UX: Integración en menú de administración
- 📦 Dep: docx@9.5.1, html2canvas@1.4.1, uuid@13.0.0, docxtemplater@3.67.6, pizzip@3.2.0
- 🔧 Fix: Formato Word corporativo AquaChile con encabezado en tabla 2x2
- 🔧 Fix: Bordes azul claro, celdas etiqueta con fondo gris
- 🔧 Fix: Tablas de materiales, procedimientos y riesgos con encabezados azul oscuro
- 🔧 Fix: Consideraciones previas con viñetas (primera en rojo)
- 🔧 Fix: Reglas Firestore para colección ETT
- 📝 Data: 2 ETTs de ejemplo cargadas (Paneles Entretecho y Collarines)

### v2.43.0 - Unified Map Modules with Hierarchy (29/01/2026)
- ✨ Feat: Módulo de Mapas unificado con jerarquía (Planta/Área/Piso/Zona)
- ✨ Feat: Selección jerárquica para asignar mapas a ubicaciones específicas
- 🎨 UX: Mejor organización de mapas por ubicación

### v2.42.1 - Reopen Inspection & Search Filter (29/01/2026)
- ✨ Feat: Boton "Reabrir" para inspecciones finalizadas
- ✨ Feat: Buscador de inspecciones por nombre, ubicacion o descripcion
- 🔧 Fix: Error de SelectItem con value vacio (changed to value="none")
- 🎨 UX: Icono de busqueda en input de filtro

### v2.42.0 - Full Inspection & Item Editing with Photo Descriptions (29/01/2026)
- ✨ Feat: Modal de edicion de inspeccion principal (titulo y descripcion)
- ✨ Feat: Modal de edicion completa de item (titulo, descripcion, prioridad, fotos)
- ✨ Feat: Nuevo modelo de fotos con descripcion individual (InspectionPhoto)
- ✨ Feat: Campo de descripcion por cada foto en modal de edicion
- ✨ Feat: Migracion automatica de fotos antiguas (string[]) al nuevo formato
- ✨ Feat: Descripciones de fotos visibles en exportacion PDF
- ✨ Feat: Boton de editar (lapiz) en header de inspeccion activa
- 🎨 UX: Selector de prioridad visual con colores en modal de edicion
- 🎨 UX: Descripcion de inspeccion visible en subheader
- 🔧 Fix: sanitizeText aplicado a textos en PDF para evitar caracteres ilegibles

### v2.41.2 - Improved PDF Landscape Layout (29/01/2026)
- 🎨 UX: Nuevo layout de dos columnas en primera página landscape
- 🎨 UX: Información general visible en la izquierda con resumen de prioridades
- 🎨 UX: Mapa reducido a la derecha para mejor proporción
- 🎨 UX: Encabezado mejorado con línea decorativa
- 🔧 Fix: Mejor aprovechamiento del espacio en página landscape
- 🔧 Fix: Texto completamente legible sin sobreposición

### v2.41.1 - PDF Photos Keep Aspect Ratio (29/01/2026)
- 🐛 Fix: Fotos en PDF ahora mantienen su relación de aspecto original
- 🎨 UX: Ajuste de imágenes dentro del contenedor sin deformación

### v2.41.0 - Interactive Marker Popup & Zoom Image Viewer (29/01/2026)
- ✨ Feat: Popup interactivo al hacer click en marcador del mapa
- ✨ Feat: Popup muestra título, descripción y fotos del punto
- ✨ Feat: Click fuera del popup lo cierra automáticamente
- ✨ Feat: Visor de imagen con zoom/pan usando react-zoom-pan-pinch
- ✨ Feat: Zoom con scroll de mouse y pellizcar en táctil
- ✨ Feat: Pan arrastrando con mouse o dedo
- ✨ Feat: Doble click alterna entre zoom completo y original
- ✨ Feat: Controles visuales de zoom (+/-/reset)
- ✨ Feat: Navegación entre múltiples fotos del marcador
- 🎨 UX: Animación fade-in al abrir popup
- 🎨 UX: Instrucciones de uso en visor de imagen
- 📦 Dep: Agregada librería react-zoom-pan-pinch

### v2.40.0 - Photo Management & PDF Photos Export (28/01/2026)
- ✨ Feat: Ver thumbnails de fotos en lista de puntos de inspección
- ✨ Feat: Click en thumbnail abre visor de imagen en grande
- ✨ Feat: Navegación entre fotos con flechas (anterior/siguiente)
- ✨ Feat: Editar fotos de un punto existente (agregar/eliminar)
- ✨ Feat: Modal dedicado para gestión de fotos por punto
- ✨ Feat: Fotos incluidas en PDF agrupadas por número de marcador
- ✨ Feat: Sección "Evidencia Fotográfica" en PDF con círculos numerados
- 🎨 UX: Indicador de cantidad de fotos (+3 si hay más de 3)
- 🎨 UX: Visor de imagen con navegación y contador

### v2.39.0 - Photos in Inspections & Landscape PDF (28/01/2026)
- ✨ Feat: Agregar fotos a cada punto de inspección (máx. 5 por punto)
- ✨ Feat: Preview de fotos en modal antes de guardar
- ✨ Feat: Exportación PDF con opción "Mapa Grande (Horizontal)"
- ✨ Feat: Mapa ocupa página completa A4 landscape para mejor visualización
- ✨ Feat: Modal de opciones antes de exportar PDF
- 🔧 Fix: Reglas de Storage para fotos de inspecciones
- 🎨 UX: Selector visual de diseño de PDF (estándar vs landscape)

### v2.38.3 - Fix undefined fields in inspectionItems (28/01/2026)
- 🔧 Fix: Campo `markerId` ya no se envía como undefined a Firestore
- 🔧 Fix: Campo `description` ahora tiene valor por defecto string vacío
- 🔧 Fix: Campos opcionales solo se agregan si están definidos

### v2.38.2 - Fix Firestore rules for inspectionItems (28/01/2026)
- 🔧 Fix: Reglas de Firestore para colección `inspectionItems` (colección independiente)
- 🔧 Fix: Índice de Firestore para `inspectionItems` (inspectionId + order)
- 🔧 Fix: Corrige error "Missing or insufficient permissions" al abrir inspección

### v2.38.1 - Fix Firestore indexes for inspections (28/01/2026)
- 🔧 Fix: Índice de Firestore para `inspections` (createdBy + createdAt DESC)
- 🔧 Fix: Índice de Firestore para `inspections` (locationId + createdAt DESC)
- 🔧 Fix: Corrige error "query requires an index" en página de inspecciones

### v2.38.0 - Inspections Page Enabled (28/01/2026)
- ✨ Feat: Página de Rutas de Inspección habilitada y accesible desde menú
- ✨ Feat: Enlace "Inspecciones" agregado al menú lateral con icono Route
- ✨ Feat: Lazy loading para InspectionsPage
- 🎨 UX: Permite crear inspecciones con múltiples marcadores en un mapa
- 🎨 UX: Ideal para levantamiento grupal de incidencias en una sola sesión

### v2.37.8 - Fix MapViewer JSX structure (28/01/2026)
- 🔧 Fix: Estructura JSX de MapViewer corregida - div de cierre faltante
- 🔧 Fix: Botones "Modificar" y "Confirmar Posición" ahora fuera del contenedor overflow
- 🔧 Fix: Corrige que los botones no aparecían al colocar marcador

### v2.37.7 - Fix confirmation buttons visibility (28/01/2026)
- 🔧 Fix: Botones "Modificar" y "Confirmar Posición" ahora visibles al colocar marcador
- 🎨 UX: Botones movidos fuera del contenedor con overflow para garantizar visibilidad
- 🎨 UX: Barra de botones ahora aparece en la parte inferior del mapa

### v2.37.6 - Fix passive event listener warnings (28/01/2026)
- 🔧 Fix: Resueltos warnings "Unable to preventDefault inside passive event listener"
- 🔧 Fix: Eventos táctiles y wheel ahora usan `{ passive: false }` correctamente
- 🎨 UX: Indicador "Arrastra para mover" se oculta cuando hay marcador pendiente

### v2.37.5 - Enhanced MapViewer navigation (28/01/2026)
- ✨ Feat: Zoom con scroll del mouse en MapViewer
- ✨ Feat: Zoom con pinch táctil (dos dedos) en dispositivos móviles
- ✨ Feat: Pan/arrastre con mouse (click + arrastrar)
- ✨ Feat: Pan/arrastre táctil (un dedo) en PWA
- 🎨 UX: Navegación fluida del mapa manteniendo capacidad de colocar marcadores
- 🎨 UX: Indicador visual "Arrastra para mover" en modo edición

### v2.37.4 - Fix Firestore index for mapVersions (28/01/2026)
- 🔧 Fix: Índice de Firestore corregido para `mapVersions` (locationId + version DESC)
- 🛠️ Deploy: Índices de Firestore desplegados a Firebase

### v2.37.3 - Fix Storage rules for maps upload (28/01/2026)
- 🔧 Fix: Reglas de Storage para mapas con estructura de subcarpetas `/maps/{locationId}/{fileName}`
- 🔧 Fix: Mejorado logging de errores al subir mapas
- 🛠️ Deploy: Reglas de Storage desplegadas a Firebase

### v2.37.2 - Fix undefined fields in Firestore (28/01/2026)
- 🔧 Fix: Campos `descripcion` y `motivoInspeccion` no pueden ser `undefined` en Firestore
- 🔧 Fix: Valores por defecto string vacío para campos opcionales al crear ubicación/versión/inspección

### v2.37.1 - Firestore Rules for Maps System (28/01/2026)
- **Fix**: Agregadas reglas de Firestore para colecciones `mapLocations`, `mapVersions`, `mapMarkers` e `inspections`
- **Fix**: Agregados índices de Firestore para consultas de mapas
- **Fix**: Mejorado logging de errores en MapsAdminPage para debugging
- **Deploy**: Reglas desplegadas automáticamente a Firebase

### v2.37.0 - Maps Complete: PDF Export & Visualization (28/01/2026)
- **Feat**: Página de Vista de Mapa (`/map-view`) con todos los marcadores de incidencias e inspecciones
- **Feat**: Filtros por tipo (inspección/incidencia), por inspección específica y por rango de fechas
- **Feat**: Exportación a PDF de inspecciones con mapa, marcadores numerados y tabla de puntos
- **Feat**: Exportación a PDF de vista de mapa con todos los marcadores filtrados
- **Feat**: Visualización del marcador en el detalle de incidencia (MapViewer integrado)
- **UI**: Botones de exportación PDF en páginas de inspecciones y vista de mapa
- **UI**: Navegación actualizada: "Vista de Mapa" agregado al menú principal

### v2.36.0 - Maps & Inspection Routes System (26/01/2026)
- **Feat**: Sistema completo de mapas para ubicaciones físicas (Planta, Recinto, Acopio, etc.)
- **Feat**: Administración de mapas con versionado (historial de versiones de planos)
- **Feat**: Selector de mapa integrado en formulario de incidencias (marcador opcional)
- **Feat**: Rutas de Inspección con múltiples marcadores numerados en un solo mapa
- **Feat**: Visualizador interactivo de mapas con zoom/pan y colocación de marcadores
- **UI**: Página de administración de mapas solo para admins (/admin/maps)
- **UI**: Nueva página de Inspecciones accesible desde el menú lateral
- **Types**: Nuevos tipos: MapLocation, MapVersion, MapMarker, Inspection, InspectionItem

### v2.35.63 - PDF Exports & Translations (26/01/2026)
- **Feat**: Nuevo modal de exportación selectiva (Por Categoría/Individual) para fichas técnicas.
- **Feat**: Traducción automática de claves técnicas (English -> Español) en PDF generado.
- **Fix**: Corrección de aspecto de imágenes "distorsionadas" en PDF (Contain Strategy).
- **Refactor**: Corrección de problemas de linter en código de repuestos.

### v2.35.62 - Image Optimization & Meta (25/01/2026)
- **Feat**: Optimización automática de imágenes de repuestos a formato WebP.
- **UI**: Visualización de metadatos en galería (Resolución, Peso y Formato).
- **Code**: Refactorización de `useStorage` y `imageUtils` para manejar dimensiones de imagen.

### v2.35.61 - Storage Rules Update (25/01/2026)
- **Fix**: Añadidas reglas de Storage para soporte legacy (Baader 200) y nuevas máquinas.
- **Deploy Note**: Estas reglas deben desplegarse manualmente (`firebase deploy --only storage`).

### v2.35.60 - RBAC & Catalog Mode (25/01/2026)
- **Feat**: Implementación de permisos (RBAC). Edición/Creación de repuestos solo para Admins.
- **Feat**: Fichas Técnicas en modo "Solo Lectura" para usuarios estándar.
- **UX**: Simplificación de formulario (Modo Catálogo). Ocultos tags y stock legacy.
- **Fix**: Reglas de Storage actualizadas para permitir subida de imágenes de repuestos.

### v2.35.59 - Build Fix (25/01/2026)
- **Fix**: Corrección de error de compilación (texto residual en `Dashboard.tsx`).
- **Code**: Eliminación de variables no usadas (`tagsLoading`).

### v2.35.58 - Machine Creation Fixes (25/01/2026)
- **Fix**: Solucionado error "Invalid document reference" al crear equipos (ahora se usa `doc()` explícito con IDs autogenerados).
- **UX**: Campos "Marca", "Modelo" y "Descripción" ahora marcados explícitamente como opcionales en el creador de jerarquías.
- **Code**: Limpieza de imports no utilizados en `MachineHierarchySelector`.

### v2.35.57 - Subcategory Icons Removal (25/01/2026)
- **UI**: Eliminación de iconos de carpeta en la barra de selección de subcategorías (`MachineSelector`) para reducir ruido visual como solicitado.

### v2.35.56 - Minimalist UI Cleanup (25/01/2026)
- **UI**: Eliminación de iconos de carpeta decorativos redundantes en gestión de categorías.
- **UI**: Retirada del botón de menú de administración (3 puntos) en las pestañas de selección de categoría (`CategorySelector`), ya que la gestión se realiza desde el módulo dedicado.

### v2.35.55 - Hierarchy Visuals (25/01/2026)
- **UI**: Mejora en la distinción visual de jerarquías. Ahora las subcategorías tienen su propio marco y fondo distintivo para facilitar la lectura.
- **Style**: Ajuste de márgenes y bordes para "recuadrar" mejor cada nivel.

### v2.35.54 - Corrected Overlay Stacking (25/01/2026)
- **Fix**: Aplicación correcta del `z-index: 9999` al componente principal `DropdownMenuContent`.
- **Refactor**: Corrección de error de selección de componente (SubMenu vs Menu) que impedía la visualización correcta.

### v2.35.53 - Dropdown Visibility Force (25/01/2026)
- **Fix**: Elevación extrema del `z-index` (9999) en menús desplegables para corregir problemas de visualización en ventanas modales oscuras.
- **UX**: Retirada definitiva de botones de acción externos en la lista de gestión.

### v2.35.52 - UI Clean Up & Z-Index Polishing (25/01/2026)
- **UI**: Eliminación de botones redundantes en lista de categorías (ahora exclusivos en menú de opciones).
- **Fix**: Elevación del `z-index` en menús desplegables para garantizar visibilidad sobre modales.

### v2.35.51 - Z-Index Fixes (25/01/2026)
- **Fix**: Solución a los menús desplegables ocultos detrás de los modales (z-index correction).
- **UI**: Mejora en la visualización de opciones flotantes.

### v2.35.50 - Quality & Interaction Fixes (25/01/2026)
- **Fix**: Restauración del menú de opciones (3 puntos) en categorías y máquinas.
- **Code**: Corrección de errores de linter (variables no usadas, expresiones ternarias sin asignación).
- **Refactor**: Limpieza de listeners de eventos para evitar bloqueos en menús desplegables.

### v2.35.49 - Category UX Refinements (25/01/2026)
- **Fix**: Corrección de títulos en diálogos (Subcategoría vs Categoría) y acciones de botones.
- **UI**: Mejora visual en niveles de anidación (mayor sangría y bordes guía).
- **UX**: Optimización de Drag & Drop (colisiones) y botones de acción rápida visibles.

### v2.35.48 - Compact Mobile Structure (25/01/2026)
- **UX**: Refactor total del `CategoryManager` para móviles. Diseño compacto sin tarjetas y acciones agrupadas.
- **UI**: Interfaz minimalista con alta densidad de información.
- **Feat**: Acciones de gestión (Editar, Archivar, Mover) consolidadas en menú desplegable.

### v2.35.47 - Nested Interactions (25/01/2026)
- **Feat**: Botones explícitos para añadir subcategorías.
- **Fix**: Visualización de jerarquía en selectores de ubicación.

### v2.35.46 - Admin Integration (25/01/2026)
- **Feat**: Acceso directo a estructura desde panel de administración.

### v2.35.45 - Structure Management (25/01/2026)
- **Feature**: Integración del Gestor de Estructura en el Dashboard. Nuevo botón "Estructura" para gestionar categorías y máquinas sin salir del módulo.
- **Admin**: Modal completo para crear/editar categorías (incluyendo subcategorías) y máquinas.
- **UX**: Soporte para mover máquinas entre categorías (vía edición) y reordenar categorías con drag & drop.

### v2.35.44 - Spares PWA UX (25/01/2026)
- **UX**: Reescrito el dashboard de repuestos para ser totalmente responsive en móviles. 
- **Component**: Nueva vista de tarjetas para la tabla de repuestos en pantallas pequeñas, evitando el scroll horizontal incómodo.
- **Layout**: Header adaptativo con botones colapsables en móvil.

### v2.35.43 - Mobile Image Optimization (25/01/2026)
- **Fix**: Reparada la optimización de imágenes en móviles. Ahora detecta si el navegador no soporta codificación `image/webp` (ej. iOS antiguos o webviews incompletos) y hace fallback automático a JPEG para evitar subir PNGs gigantes.

### v2.35.42 - Technical UI & Smart Inputs (25/01/2026)
- **Feature**: Metadata detallada en fotos (Compresión/Formato/Resolución).
- **UX**: Input de Título expandible y corregido con dictado por voz.
- **AI**: Prompt de síntomas ajustado para ser "Senior Technical Analyst" (conciso y preciso).

### v2.35.41 - AI Logic & Speech Input Fixes (25/01/2026)
- **Fix**: Resuelto conflicto de código duplicado en el servicio de IA y errores JSX.
- **Feature**: Mejorada la detección de síntomas con contexto completo y limpieza de transcripción.

### v2.35.40 - Microphone in Title (25/01/2026)
- **Feature**: Agregado soporte de dictado por voz (micrófono) también en el campo "Título" al crear incidencias.
- **UI**: Ajustado el layout del formulario para acomodar tanto el botón de "Mejorar con IA" como el de "Dictado".

### v2.35.39 - Visual Polish & Reporter UX (25/01/2026)
- **UX**: Ahora se muestra el nombre real del usuario que reportó la incidencia en lugar de su ID interno.
- **UI**: Mejorado el contraste de los badges de síntomas en el modal de detalle para mejor legibilidad en temas oscuros/claros.

### v2.35.38 - Deep Drill-Down Details (25/01/2026)

**Nuevas Características:**
- **Detalle de Incidencia Interactivo**: Implementado modal de detalle profundo al hacer clic en incidencias dentro del Análisis de Fallas. Permite ver descripción completa, evidencias fotográficas, resolución y metadatos sin salir del dashboard predictivo.

---

### v2.35.37 - Fixes & Cleanup (25/01/2026)

**Correcciones y Mejoras:**
- 🐛 **TypeScript Fixes**: Resolución de errores de tipado en `MachineHierarchySelector` (propiedades faltantes en `MachineCategory`).
- 🧹 **Code Cleanup**: Eliminación de imports no utilizados en `FailureAnalysis.tsx` y limpieza de código muerto.
- 🔧 **Estabilidad**: Corrección de validaciones nulas en gráficos y restauración de iconos faltantes (`CheckCircle2`, `Calendar`).

**Tipo de cambio:** fix

---

### v2.35.36 - Feature: Interactive Analysis (25/01/2026)

**Nuevas Funcionalidades:**
- 👆 **Gráficos Interactivos**: Al hacer clic en una barra del gráfico "Pareto de Síntomas" o en la tarjeta "Síntoma Top #1", se abre un detalle.
- 🗂️ **Listado Contextual**: Modal emergente que filtra y muestra todas las incidencias históricas relacionadas con el síntoma seleccionado.

**Tipo de cambio:** feat

### v2.35.35 - Maintenance: Cleanup (25/01/2026)

**Mantenimiento:**
- 🧹 **Cleanup**: Eliminados imports no utilizados (`Textarea`, `Mic`, `Plus`) en formularios de incidencias.
- 🔧 **Estabilidad**: Validación final de build tras corrección de sintaxis.

**Tipo de cambio:** chore

### v2.35.34 - Fix: Build Syntax Error (25/01/2026)

**Correcciones:**
- 🐛 **Build Critical**: Solucionado error de sintaxis (tags HTML duplicados) en `IncidentForm` que rompía la compilación en producción.
- ✅ **Validación**: Verificada compilación local exitosa (`pnpm build`).

**Tipo de cambio:** fix

### v2.35.33 - Fix: Failure Analysis Types (25/01/2026)

**Correcciones:**
- 🐛 **TypeScript Errors**: Corregidos errores de tipos en el módulo de Análisis de Fallas.
    - Manejo seguro de arrays vacíos en `symptomStats`.
    - Corrección de claves de estado (`cerrada` y `confirmada` en lugar de `resuelta`).
    - Lógica de conteo de estados alineada con el modelo de datos real.

**Tipo de cambio:** fix

### v2.35.32 - Feature: Failure Analysis Module (25/01/2026)

**Nuevas Funcionalidades:**
- 📈 **Módulo Análisis de Fallas**: Nuevo submódulo dentro de "Predictivo" para analizar patrones históricos.
- 📊 **Dashboards Visuales**: 
    - Pareto de Síntomas (Frecuencia de fallas).
    - Distribución de Estados (Pie chart).
    - KPIs Automáticos (Tasa de cierre, top síntoma).
- 🧠 **Insights**: Listado de los últimos "Hallazgos Críticos" basado en la prioridad.

**Infraestructura:**
- Integración de `chart.js` para visualización de datos.

**Tipo de cambio:** feat

### v2.35.31 - Feature: UI Refresh & Custom Symptoms (25/01/2026)

**Nuevas Funcionalidades:**
- 🏷️ **Síntomas Personalizados**: Al seleccionar "Otro", ahora puedes escribir un síntoma nuevo directamente.
- 📐 **Ubicación Compacta**: La sección de ubicación se ha rediseñado con un "zoom out" (70%) para ocupar menos espacio vertical.
- 🎤 **Título AI**: Agregado soporte para "Mejorar redacción" (Magic Button) en el campo de título.
- 📷 **Metadata en Fotos**: Las fotos ahora muestran su resolución y peso comprimido en una leyenda.
- 🎛️ **Prioridad Compacta**: Selectores de prioridad rediseñados para ser más compactos (4 en línea).

**Mejoras Técnicas:**
- **Compresión**: Se visualiza explícitamente el ahorro de espacio gracias a WebP.

**Tipo de cambio:** feat/style

### v2.35.30 - UI/UX Refinement (25/01/2026)

**Mejoras:**
- 📐 **UI Adaptable**: El campo de texto (`SpeechTextarea`) ahora se ajusta automáticamente a la altura del contenido (auto-resize).
- 🧠 **IA Precisa**: Ajustado el prompt de refinamiento para generar textos técnicos más concisos, evitando redundancias, comillas y párrafos extensos.

**Tipo de cambio:** style/refactor

### v2.35.29 - Fix: UX/UI Síntomas (25/01/2026)

**Correcciones:**
- 🐛 **Limpieza de Síntomas**: Al refinar la descripción, la lista de síntomas ahora se filtra para mostrar solo los detectados por la IA + los seleccionados, eliminando sugerencias antiguas irrelevantes.
- 👁️ **Visibilidad**: Asegura que los nuevos síntomas detectados sean inmediatamente visibles y seleccionables.

**Tipo de cambio:** fix

### v2.35.28 - Feature: AI Context & Extended Voice (25/01/2026)

**Cambios:**
- 🧠 **IA Contextual**: Mejorada extracción de síntomas incluyendo título, prioridad y equipo para mayor precisión.
- 🎤 **Voz & IA**: Extendido soporte de dictado y "Magic Button" a formularios de Resolución y Rechazo.
- 🐛 **Fix**: Corrección en auto-selección de síntomas (fusión de estados en `IncidentForm`).

**Tipo de cambio:** feat

### v2.35.27 - DevOps: Secrets Integration (25/01/2026)

**Cambios:**
- 🔧 **CI/CD**: Actualizado workflow de despliegue para inyectar `VITE_GROQ_API_KEY` desde GitHub Secrets.
- 🔒 **Seguridad**: Habilitado soporte para variables de entorno en build de producción.

**Tipo de cambio:** chore

### v2.35.26 - Maintenance: Version Synchronization (25/01/2026)

**Cambios:**
- 🔄 **Sincronización**: Actualización de versión para mantener consistencia en el historial de despliegues.
- 🧹 **Limpieza**: Estandarización de commits de versión.

**Tipo de cambio:** chore

### v2.35.25 - UX: Feedback Visual "Magic Button" (25/01/2026)

**Mejoras:**
- ✨ **Feedback UI**: Agregados mensajes (Toasts) de estado: "Mejorando...", "Error de configuración", "¡Listo!".
- 🔧 **Validación**: Comprobación explícita de API Key antes de enviar petición a Groq.
- 🐛 **Log**: Mensajes de error más descriptivos en consola para facilitar debugging.

**Tipo de cambio:** feat

### v2.35.24 - Producción: Magic Button Stable (25/01/2026)

**Cambios:**
- 🚀 **Producción**: Versión estable con "Magic Button" validado.
- 🔒 **Seguridad**: Eliminado rastreo de archivo de variables locales (`.env.local`).

**Tipo de cambio:** chore

### v2.35.23 - Fix: Validación de claves IA y configuración (25/01/2026)

**Correcciones:**
- 🔧 Agregada validación y logging explícito cuando falta la API Key de Groq
- 🔧 Actualizada configuración de entorno para incluir `VITE_GROQ_API_KEY`

**Tipo de cambio:** fix

### v2.35.22 - Feat: Magic Button & Symptom Extraction (25/01/2026)

**Nuevas Funcionalidades:**
- ✨ **Botón Mágico (AI):** Nueva funcionalidad para refinar descripciones de incidencias automáticamente usando IA
- ✨ **Extracción de Síntomas:** La IA analiza la descripción y selecciona los síntomas correspondientes automáticamente
- ✨ Integración completa con Groq (Llama 3) para procesamiento de lenguaje natural

**Mejoras:**
- 🎨 UI de redacción mejorada con feedback visual durante el procesamiento
- 🔧 Reparación y optimización del servicio `ai.ts`

**Tipo de cambio:** feat

### v2.31.10 - Fix: Tab único y máquinas visibles (21/01/2026)

**Correcciones:**
- 🔧 CategorySelector ya no duplica "Máquinas Principales" si existe como categoría real
- 🔧 MachineSelector muestra máquinas cuando la categoría real es "maquinas-principales" o cuando no tienen categoría

**Tipo de cambio:** fix

### v2.31.9 - Default category selection: Máquinas Principales (21/01/2026)

**Nuevas Funcionalidades:**
- ✨ Agregado tab "Máquinas Principales" como categoría virtual (pseudo-categoría)
- ✨ Por defecto, el dashboard selecciona "Máquinas Principales" (máquinas sin categoría)

**Mejoras:**
- 🎨 Nuevo comportamiento: Al abrir repuestos, ve máquinas principales por defecto
- 🔧 CategorySelector ahora muestra "Máquinas Principales" como primer tab
- 🔧 MachineSelector filtra correctamente máquinas sin categoryId cuando está seleccionado "maquinas-principales"

**Tipo de cambio:** feature + UX improvement

### v2.31.8 - Máquinas sin categoría + Colores oscuros consistentes (21/01/2026)

**Nuevas Funcionalidades:**
- ✨ Mostrar máquinas sin categoría en CategoryManager (Máquinas Principales)
- ✨ Ahora se pueden asignar categorías a máquinas sin categoría desde Configuración
- 🐛 Arreglado: Fishken, Grader y otras máquinas no aparecían en CategoryManager

**Mejoras Visuales:**
- 🎨 Cambio de color en CategoryManager: azul → gris oscuro (slate-400) para link lucide.dev
- 🎨 Nueva sección "Máquinas sin Categoría" con diseño destacado (azul/gris oscuro)

**Tipo de cambio:** feature + fix

### v2.31.7 - UI Polish: Consistencia de colores + Limpieza de navegación (21/01/2026)

**Mejoras Visuales:**
- 🎨 Cambio de color en CategorySelector: azul → gris oscuro (slate-400) para consistencia con tema
- 🎨 Ahora los enlaces de categorías usan paleta de grises oscuros (slate)
- 🧹 Removido módulo "Catálogo de Bases" del sidebar (no utilizado)
- 🧹 Limpieza de import no utilizado: Zap icon

**Tipo de cambio:** chore (mejora UI)

### v2.31.6 - Selector de categoría al crear/editar máquinas (21/01/2026)

**Correcciones:**
- 🔧 Agregado selector de categoría en diálogo de crear/editar máquina
- 🔧 Ahora se puede cambiar la categoría de una máquina existente
- 🔧 Validación: categoría es obligatoria al crear/editar máquina
- 🔧 Select muestra solo categorías activas

**Mejoras:**
- 🎨 Campo "Categoría" visible en formulario de máquina
- 🎨 Dropdown con todas las categorías disponibles
- 🎨 Pre-selecciona categoría al crear desde botón "+ Máquina" de categoría

**Tipo de cambio:** fix

### v2.31.5 - Vista jerárquica: Categorías con Máquinas expandibles (21/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Vista jerárquica unificada**: Categorías → Máquinas dentro de cada categoría (expandible)
- ✅ Botón "+ Máquina" en cada categoría para crear en contexto
- ✅ Lista expandible/colapsable de máquinas por categoría
- ✅ Gestión completa de máquinas desde dentro de cada categoría
- ✅ Indicador visual de máquinas con color + marca + modelo
- ✅ Auto-expansión de categoría al crear nueva máquina

**Mejoras:**
- 🎨 Pestaña única "Categorías y Máquinas" (eliminada pestaña separada "Máquinas")
- 🎨 UI más intuitiva: todo se gestiona desde la jerarquía visual
- 🎨 Borde izquierdo en lista de máquinas para mejor separación visual
- ♻️ Simplificación: menos pestañas, más contexto

**Estructura Final de Configuración:**
1. General
2. Usuarios
3. Invitaciones
4. Notificaciones
5. **Categorías y Máquinas** (vista jerárquica unificada)
6. Sistema

**UX mejorado:**
- Crear máquina en contexto de su categoría
- Ver todas las máquinas de una categoría con un clic
- Gestión más intuitiva y organizada

**Tipo de cambio:** feat

### v2.31.4 - CategoryManager y pestaña Categorías en Configuración (21/01/2026)

**Nuevas Funcionalidades:**
- ✅ Componente CategoryManager.tsx con gestión completa de categorías de máquinas
- ✅ Pestaña "Categorías" en Configuración (Settings) para administradores
- ✅ Vista de categorías activas con drag & drop para reordenar
- ✅ Vista separada de categorías archivadas
- ✅ Contador de máquinas asignadas por categoría
- ✅ Iconos dinámicos de Lucide para cada categoría
- ✅ Diálogos de creación y edición de categorías
- ✅ Validación: no se puede eliminar categoría con máquinas asignadas

**Mejoras:**
- 🎨 Reorganización de pestañas en SettingsPage: General → Usuarios → Invitaciones → Notificaciones → **Categorías** → Máquinas → Sistema
- 🎨 Icono de "Sistema" cambiado a Shield para mejor diferenciación
- 🎨 UI consistente con diseño de underline 3px en modo oscuro

**Estructura de Gestión:**
- Categorías (padre) → Máquinas (hijos)
- Acceso desde Configuración para administradores
- Separación clara entre gestión de categorías y máquinas

**Tipo de cambio:** feat

### v2.31.3 - Fix categoryId mapping y guidelines de desarrollo (21/01/2026)

**Nuevas Funcionalidades:**
- ✅ DEVELOPMENT_GUIDELINES.md para comportamiento consistente de IA entre sesiones
- ✅ Flujo estandarizado de finalización de iteraciones

**Correcciones:**
- 🔧 **CRÍTICO**: Mapeo de `categoryId` en todos los queries de máquinas (fetchMachines, getMachine, onSnapshot)
- 🔧 Bug: CategoryId se guardaba pero no se leía de vuelta en la UI
- 🔧 Mapeo incompleto en 3 lugares diferentes del hook useMachines

**Notas de Desarrollo:**
- Implementado sistema de documentación para IA
- Definida estrategia semver para versionado
- Establecido checklist de validación pre-deploy

### v2.31.2 - Persistencia de tema y fix filtrado categorías (20/01/2026)

**Nuevas Funcionalidades:**
- ✅ Toggle de tema oscuro/claro en Configuración > General con persistencia en localStorage
- ✅ Script de migración para agregar categoryId a máquinas existentes
- ✅ Tema se recuerda entre sesiones sin flash

**Correcciones:**
- 🔧 Fix filtrado de máquinas por categoría (todas las máquinas tienen categoryId configurado)
- 🔧 Tema se aplica antes de que React cargue (script inline en HTML)

### v2.31.1 - Fix categorías máquinas (20/01/2026)

**Nuevas Funcionalidades:**
- ✅ Gestión de máquinas en Configuración (admin) con selector de categoría
- ✅ Drag & drop de categorías con persistencia

**Correcciones:**
- 🔧 Fix Radix Select: se evita valor vacío en edición de máquina/categoría
- 🔧 Auto-asignación inicial de categorías a máquinas existentes

**Tipo de cambio:** fix

---

### v2.31.0 - Mejoras UI Sensores y Gestión Dispositivos RTDB (20/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Función eliminar dispositivos duplicados** - Limpieza de Firebase RTDB
- ✅ **UI Sensores reorganizada** - Layout 2 columnas con dashboard estadísticas
- ✅ **Cards modulares** - Telemetría, Emparejar WiFi, y Modo AP separados
- ✅ **Device list mejorada** - Muestra deviceName, apSsid, y dirección IP
- ✅ **Dashboard estadísticas** - Resumen en tiempo real de dispositivos

**Mejoras Técnicas:**
- 🔧 Fix detección dispositivos real-time sin throttling
- 🔧 Fix propagación de eventos en botón eliminar
- 🔧 Optimización rendimiento componente SensorsPage

**Tipo de cambio:** feat (nueva funcionalidad)

---

### v2.30.0 - Migración de Máquinas y Repuestos (20/01/2026)

**Nuevas Funcionalidades:**
- ✅ **9 Máquinas creadas** - Baader 200, cintas, MAREL, sistemas bombeo
- ✅ **61 PlantAssets registrados** - Motores (7) y Bombas (54)
- ✅ **Scripts de migración** - Generación e importación de datos
- ✅ **Guía de migración** - Instrucciones para Firebase Console/Admin SDK
- ✅ **Estructura Firestore** - Colecciones `machines` y `plantAssets`

**Archivos Nuevos:**
- `scripts/generate_migration_data.js` - Genera JSON para importar
- `scripts/import_migration_data.js` - Importa vía Admin SDK
- `scripts/migrate_machines_and_assets.js` - Script completo
- `scripts/migrate_instructions.js` - Muestra instrucciones
- `functions/migrate_data.js` - Cloud Function para migración
- `MIGRATION_GUIDE.md` - Guía completa de migración
- `output/machines.json` - 9 máquinas
- `output/plant_assets.json` - 61 motores/bombas

---

### v2.29.0 - Módulo Repuestos Completo + Catálogo de Bases (20/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Sistema completo de Repuestos por máquina** - Gestión multi-máquina con tabs
- ✅ **CRUD de Repuestos** - Crear, editar, eliminar con validación
- ✅ **Gestión de Tags** - Tags globales (solicitud/stock) con asignación a repuestos
- ✅ **Filtros avanzados** - Búsqueda por código SAP, texto breve, descripción
- ✅ **Paginación flexible** - 10/25/50/100 items por página
- ✅ **Toast notifications** - Sistema global de notificaciones con variantes
- ✅ **Catálogo de Bases (Motores/Bombas)** - Vista tabla y mapas interactivos
- ✅ **Mapas de Planta** - Visualización de ubicaciones de equipos con marcadores
- ✅ **Modal de detalles técnicos** - Especificaciones completas, referencias, imágenes
- ✅ **Utilidades de imágenes** - Optimización, validación, conversión a base64
- ✅ **Estado vacío contextual** - Mensajes específicos para filtros sin resultados

**Mejoras Técnicas:**
- ✅ Estructura modular: hooks, componentes, tipos, utilidades separados
- ✅ Real-time Firestore listeners con sincronización automática
- ✅ Compresión de imágenes con Canvas API
- ✅ Estadísticas dinámicas (total, con stock, con solicitudes, con imágenes)
- ✅ Historial de cambios de repuestos con Firestore subcollections
- ✅ Export en pages/index.ts para todas las nuevas páginas

**Bug Fixes:**
- ✅ 36 errores de TypeScript corregidos en módulo repuestos
- ✅ Importaciones de funciones desde tipos corregidas
- ✅ Tipificación de parámetros en callbacks completada

**Archivos Nuevos (17 archivos):**
- Páginas: Dashboard.tsx, CatalogoBases.tsx
- Componentes: RepuestosTable, RepuestoForm, RepuestosFilters, RepuestosPagination, EmptyState
- Componentes: MotorasBombasTable, MapasViewer, AssetDetailModal
- Componentes UI: toast.tsx, toaster.tsx
- Hooks: useRepuestos, useTags, useMachines, useStorage, usePlantMaps, usePlantAssets, usePlantMapAreas, useToast
- Tipos: repuestos.ts (~246 líneas completas)
- Utilidades: imageUtils.ts, utils/repuestos/index.ts
- Estilos: Integración con Tailwind y Radix UI

---

### v2.28.0 - Sensores UI Completa + Device Management (19/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Función eliminar dispositivos duplicados** en Firebase RTDB para sensores IoT
- ✅ **UI Sensores reorganizada** en 2 columnas con dashboard de estadísticas integrado
- ✅ **Cards separadas** para Telemetría, Emparejar Dispositivos y WiFi Access Point
- ✅ **Device list mejorada** mostrando deviceName, apSsid e IP local en formato legible

**Mejoras Técnicas:**
- ✅ Fix detección real-time sin throttling en suscripción de sensores
- ✅ Fix propagación de eventos en botón eliminar dispositivo (event bubbling)
- ✅ Dashboard de estadísticas en página SensorsPage con contadores
- ✅ Mejor separación visual entre funcionalidades con cards independientes

**Bug Fixes:**
- ✅ Botón eliminar dispositivo no propagaba eventos correctamente
- ✅ Real-time updates ahora se procesan sin retrasos artificiales

---

### v2.27.0 - Dashboard de Incidencias Interactivo + Admin Only Edit/Delete (19/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Dashboard de incidencias interactivo** - Stats convertidas en filtros clickeables
- ✅ **Cards de estado ampliadas** - Total, Pendientes, Confirmadas, Asignadas, Sin Asignar, En Proceso, Críticas, Cerradas, Rechazadas
- ✅ **Filtro visual mejorado** - Highlight del filtro activo con color temático
- ✅ **Botón "Limpiar filtro"** para volver a vista general
- ✅ **Permisos restrictos** - Solo admin puede editar y eliminar incidencias
- ✅ **Modal de edición** en IncidentForm para admin
- ✅ **Botón "Editar"** solo visible para admin en IncidentDetail
- ✅ **Datos IoT en modal** de incidencias - temp/hum actual, promedio, rangos warn/crit
- ✅ **Badge "Dato simulado"** cuando fuente de sensores es simulada

**Mejoras Técnicas:**
- ✅ Permisos `canEditIncident` restricto solo a admin
- ✅ IncidentForm soporta modo edición con props `incident`
- ✅ Fetch one-shot de sensores: `fetchSensorSummaryOnce()` y `fetchLastSensorReadings()`
- ✅ Fix JSX fragments en DashboardPage (cajas críticas)
- ✅ Limpieza de imports no utilizados en IncidentsPage
- ✅ Fix runtime "Clock is not defined" con evaluación lazy de iconos

**Bug Fixes:**
- ✅ Fix referencias indefinidas a `filterStatus`/`filterPriority`
- ✅ Fix pantalla negra al no haber incidencias en filtro
- ✅ Fix mensaje dinámico en "Sin resultados"

---

### v2.26.0 - Sensores Dashboard + Mis Incidencias Mejorado (19/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Filtro "Mis Incidencias" mejorado** - ahora incluye creadas Y asignadas al usuario
- ✅ **Info creador/asignado en tarjetas** de incidencias (visibilidad)

**Mejoras Técnicas:**
- ✅ Tipo `Incident` extendido con `creadoPor`, `creadoPorNombre`, `asignadoANombre`
- ✅ Stats counter "Mis Incidencias" ahora usa lógica OR (creadas || asignadas)

---

### v2.25.0 - Notificaciones Test Admin + Sensores Dashboard (18/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Botón test notificaciones para admins** - envía push FCM real a todos los supervisores/admins
- ✅ **Sensores Dashboard reorganizado** en 2 columnas con estadísticas
- ✅ **Cards separadas** para Telemetría, Emparejar y WiFi AP
- ✅ **Device list mejorada** mostrando deviceName, apSsid e IP
- ✅ **Función eliminar dispositivos duplicados** en Firebase RTDB

**Mejoras Técnicas:**
- ✅ Cloud Function `sendTestNotification` con auth y role check
- ✅ Service `test-notifications.ts` para llamar Cloud Function
- ✅ NotificationsSettings UI con botón admin-only
- ✅ Fix detección real-time sin throttling en sensores
- ✅ Fix propagación de eventos en botón eliminar
- ✅ Fix imports `onCall` desde `firebase-functions/v2/https`
- ✅ Fix tipo en `technicianColors` con fallback `?? '#3b82f6'`

---

### v2.24.1 - Fix Select Preventivo (18/01/2026)

**Fixes Técnicos:**
- ✅ Radix Select sin valores vacíos en "Asignado a" y "Equipos" (evita crash al crear tareas)

---

### v2.24.0 - Tareas Preventivas + Notificaciones (18/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Tareas Preventivas** con creación, edición y ejecución
- ✅ **Selector de Jerarquía** para filtrar equipos por ubicación
- ✅ **Asignación de técnicos** a tareas preventivas
- ✅ **Notificaciones Push** para tareas preventivas y ejecuciones
- ✅ **Notificaciones omnidireccionales** (técnico asignado + supervisores/admins)
- ✅ **Historial de ejecuciones** de tareas de mantenimiento

**Mejoras Técnicas:**
- ✅ Firebase Cloud Messaging (FCM) integrado para notificaciones
- ✅ Triggers Cloud Functions para eventos de preventive tasks/executions
- ✅ Validación Zod en formularios de preventiva
- ✅ Sincronización de estado UI con firebase

---

### v2.23.0 - Sensores + limpieza RTDB (17/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Eliminar dispositivos duplicados en Firebase RTDB**
- ✅ **UI Sensores reorganizada en 2 columnas** con dashboard de estadísticas
- ✅ **Cards separadas** para Telemetría, Emparejar y WiFi AP
- ✅ **Device list mejorada** con deviceName, apSsid e IP

**Fixes Técnicos:**
- ✅ Fix detección real-time sin throttling
- ✅ Fix propagación de eventos en botón eliminar

---

### v2.22.2 - Predictivo + IA IoT (17/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Estado del sensor en Predictivo** (online, RSSI, SSID/IP/AP y lastSeen)
- ✅ **Predicción IA opcional** con Groq (lecturas recientes)
- ✅ **Atajo a Sensores** desde Predictivo

**Mejoras Técnicas:**
- ✅ Integración RTDB `devices/` en Predictivo

### v2.22.1 - OTA por WiFi + estado de red local (16/01/2026)

**Nuevas Funcionalidades:**
- ✅ **OTA por WiFi** (actualización sin USB)
- ✅ **Panel local muestra SSID/IP/RSSI**

**Mejoras Técnicas:**
- ✅ Configuración OTA documentada en PlatformIO

### v2.22.0 - Red local simplificada + AP con contraseña desde PWA (15/01/2026)

**Nuevas Funcionalidades:**
- ✅ **Red local simplificada en ESP32** (AP + captive portal básico)
- ✅ **Panel local ligero** con lecturas actuales y estado
- ✅ **AP protegido** con contraseña configurada desde PWA

**Mejoras Técnicas:**
- ✅ Menos endpoints locales y menor carga en memoria
- ✅ Manejo centralizado de red local

### v2.21.0 - Gestión de Dispositivos + UI Sensores Mejorada (15/01/2026)

**Nuevas Funcionalidades:**
- 🧹 **Eliminar dispositivos duplicados (Firebase RTDB)**:
  - Nueva función para limpiar dispositivos duplicados/huérfanos en RTDB
  - Acción integrada en la UI de Sensores

- 🧭 **UI Sensores reorganizada**:
  - Layout en 2 columnas con dashboard de estadísticas
  - Cards separadas para Telemetría, Emparejar y WiFi AP
  - Device list mejorada con deviceName, apSsid e IP

- 📈 **ESP32 histórico persistente + intervalo configurable**:
  - Lecturas guardadas en LittleFS (hasta 20,000)
  - Intervalo de lectura configurable desde panel local

- 📊 **Dashboard ESP32 mejorado**:
  - Tooltip touch/hover para ver lecturas al tocar el gráfico
  - Muestra tiempo y valores (temp/hum) del punto tocado
  - Botón reset zoom "100%" para volver a vista normal
  - Rangos del eje Y ajustados fielmente a las lecturas
  - UI compacta (~30% más pequeña) para mejor visual en móvil
  - Meta info en múltiples líneas (device, equipo, ruta)

**Fixes Técnicos:**
- ✅ Fix detección real-time sin throttling
- ✅ Fix propagación de eventos en botón eliminar
- ✅ Zoom Y ahora ajusta rangos correctamente

**Build PWA:**
- ✅ Build local OK (apps/pwa)
- ✅ Firmware ESP32 flasheado (95.6% flash)

---

### v2.20.0 - ESP32 Dashboard Local + USB Detection + Mejoras UI (15/01/2026)

**Nuevas Funcionalidades:**
- 🌐 **Servidor Web Local ESP32**:
  - Dashboard embebido en ESP32 con Chart.js
  - 3 endpoints REST: `/`, `/api/current`, `/api/history`
  - Buffer circular 100 lecturas en RAM
  - Visualización temp/humedad en tiempo real con gráficos
  - Acceso vía `http://192.168.4.1` (AP) o IP local (STA)
  - HTML glassmorphism con gradientes responsivos
  - Actualización automática cada 5 segundos

- 🔌 **Detección USB Automática**:
  - Hook `useUsbDetection` con Web Serial API
  - Auto-detección ESP32 por VID (0x10C4, 0x1A86, 0x0403)
  - Lectura MAC via serial (115200 baud)
  - Botón USB en SensorsPage con auto-selección
  - Soporte Chrome/Edge (Web Serial API)
  - Timeout 5s con manejo de errores robusto

- 🗑️ **Eliminar Dispositivos Duplicados**:
  - Nueva función para limpiar dispositivos huérfanos/duplicados
  - Integrada en UI de sensores
  - Fix propagación eventos en botón eliminar

- 📊 **UI Sensores Reorganizada**:
  - Layout 2 columnas con dashboard estadísticas
  - Cards separadas: Telemetría, Emparejar, WiFi AP
  - Device list mejorada: deviceName, apSsid, IP
  - Fix detección real-time sin throttling

**Archivos Nuevos:**
- `iot/esp32-sensor/src/webserver_local.h`: Header servidor web local
- `iot/esp32-sensor/src/webserver_local.cpp`: Implementación REST API
- `apps/pwa/src/hooks/useUsbDetection.ts`: Hook detección USB
- `apps/pwa/src/types/webserial.d.ts`: Tipos Web Serial API

**Archivos Modificados:**
- `iot/esp32-sensor/src/main.cpp`:
  - Include webserver_local.h
  - Setup servidor en `initAfterWifiOnce()`
  - `handleLocalWebServer()` en loop
  - `addTelemetryReading()` en `sendSensorData()`
  - Publicación wifiSsid/wifiPassword en Firebase
  - Variables deviceId/currentEquipmentId sin static (extern)
- `iot/esp32-sensor/platformio.ini`:
  - Agregada dependencia ArduinoJson @ ^7.2.1
- `apps/pwa/src/pages/SensorsPage.tsx`:
  - Import Usb icon + useUsbDetection hook
  - Botón USB junto a búsqueda
  - Auto-selección dispositivo USB detectado
  - Mensajes feedback USB
  - Card "Conexiones WiFi" con cuadros WiFi + AP
  - Botones copiar + toggle password + link panel local
- `apps/pwa/src/services/devicesRtdb.ts`:
  - Campos wifiSsid, wifiPassword en DeviceNode

**Fixes Técnicos:**
- ✅ Correcciones ArduinoJson v7 (breaking changes):
  - `StaticJsonDocument/DynamicJsonDocument` → `JsonDocument`
  - `array.createNestedObject()` → `array.add<JsonObject>()`
  - Operador ternario nullptr → if/else explícito
- ✅ Tipos Web Serial API completos (webserial.d.ts)
- ✅ Null checks en usbDevices[0] (TypeScript strict)
- ✅ Navigator.serial optional chaining

**Dependencias:**
- ArduinoJson 7.4.2 (ESP32)
- PlatformIO 6.1.18
- intelhex 2.3.0 (esptool dependency)

**Compilación ESP32:**
- ✅ Build exitoso: firmware.bin 1.21 MB
- RAM: 28.8% (94.2 KB / 320 KB)
- Flash: 92.5% (1.21 MB / 1.28 MB)

---

### v2.19.0 - Mejoras UX Sensores y Config WiFi AP (15/01/2026)

**Nuevas Funcionalidades:**
- 🔐 **Config WiFi AP Ultra Mejorada**:
  - Toggle 👁️ para mostrar/ocultar contraseña actual y nueva
  - Generador de contraseñas seguras aleatorias (12 caracteres)
  - Indicador visual de fortaleza (débil/media/fuerte)
  - Validación visual con alertas si < 8 caracteres
  - Botones copiar 📋 para SSID y contraseña con feedback ✓
  - Carga automática de valores actuales del dispositivo
  - Contador de caracteres dinámico
  
- 🗑️ **Eliminar Dispositivos**: nueva función para eliminar dispositivos duplicados/huérfanos
- 📊 **UI Reorganizada**: dashboard de estadísticas y cards separadas
- 🔄 **Fix Real-time**: detección sin throttling
- ✅ **Fixes TypeScript**: agregadas propiedades apPassword/apEnabled en DeviceNode

**Mejoras UX:**
- Cuadro visual gradiente azul para configuración actual del AP
- Muestra SSID y contraseña guardada con opciones de copiar
- Generador criptográficamente seguro usando crypto.getRandomValues
- Excluye caracteres confusos (0/O, 1/l/I) en contraseñas generadas
- Barra de progreso visual para fortaleza de contraseña
- Feedback inmediato al copiar (icono check verde por 2s)

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: 
  - Agregados iconos Eye, EyeOff, Copy, RefreshCw, Check
  - Nuevo estado showApPassword y copiedField
  - useEffect para cargar config AP del dispositivo seleccionado
  - Función generateSecurePassword() con crypto.getRandomValues
  - Función copyToClipboard() con feedback visual
  - Mejoras visuales en cuadro "Configuración Actual del AP"
  - Campo contraseña con toggle, generador y validación
- `apps/pwa/src/services/devicesRtdb.ts`:
  - Agregadas propiedades apPassword y apEnabled en tipo DeviceNode
- `apps/pwa/src/services/apConfigRtdb.ts`: 
  - Fix autocomplete ultra-agresivo (one-time-code, name dinámico)

**Beneficios:**
- ✅ Usuario puede ver y copiar fácilmente credenciales WiFi
- ✅ Generación de contraseñas seguras en 1 click
- ✅ Validación visual previene contraseñas débiles
- ✅ UX más profesional y pulida
- ✅ Menos errores al transcribir manualmente

---

### v2.18.1 - Selectores en Cascada (Padre → Hijo) (15/01/2026)

**Mejora:**
- 🔗 **Cascada Jerárquica**: selectores ahora funcionan en cascada (padre → hijo).
- 🎯 **Filtrado Inteligente**: al seleccionar un nivel padre, los selectores hijos solo muestran opciones válidas de ese padre.
- 🔄 **Reset Automático**: al cambiar un nivel padre, los niveles hijos se resetean a "Todos" automáticamente.
- ✅ **UX Mejorada**: navegación más intuitiva por la jerarquía de equipos.

**Comportamiento:**
- Seleccionar **Planta** → filtra Sectores de esa planta (y resetea Sector/Área/Niveles 4-7)
- Seleccionar **Sector** → filtra Áreas de ese sector (y resetea Área/Niveles 4-7)
- Seleccionar **Área** → filtra Nivel 4 de esa área (y resetea Niveles 4-7)
- Y así sucesivamente hasta el nivel 7

**Ejemplo de Flujo:**
1. Usuario elige "Planta Norte" → Selector de Sector solo muestra sectores de Planta Norte
2. Usuario elige "Sector A" → Selector de Área solo muestra áreas de Planta Norte > Sector A
3. Si usuario cambia de Planta, los sectores/áreas se resetean automáticamente

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: 
  - Actualizados 6 useMemo (sectoresDisponibles hasta nivel7Disponibles) para filtrar por nivel padre
  - Agregada lógica de reset en cascada en onValueChange de cada selector
  - Cada nivel ahora considera las selecciones de todos los niveles superiores

**Beneficios:**
- ✅ Elimina confusión de opciones incompatibles
- ✅ Reduce errores de selección incorrecta
- ✅ Acelera navegación al limitar opciones relevantes
- ✅ Comportamiento estándar esperado en selectores jerárquicos

---

### v2.18.0 - Jerarquía Extendida a 7 Niveles (14/01/2026)

**Nueva Funcionalidad:**
- 🎯 **7 Niveles de Jerarquía**: extendida la jerarquía de equipos de 3 a 7 niveles máximos.
- 📊 **Selectores Dinámicos**: niveles adicionales (4-7) solo se muestran si existen datos para ellos.
- 🔍 **Filtrado Completo**: todos los niveles son filtables de forma independiente.
- ✨ **Layout Responsivo**: primera fila con 3 niveles (Planta/Sector/Área), segunda fila con hasta 4 niveles adicionales.

**Estructura de Jerarquía:**
1. **Nivel 1**: Planta (existente)
2. **Nivel 2**: Sector (existente)
3. **Nivel 3**: Área (existente)
4. **Nivel 4**: Línea, Sección, etc. (nuevo)
5. **Nivel 5**: Zona, Célula, etc. (nuevo)
6. **Nivel 6**: Módulo, Estación, etc. (nuevo)
7. **Nivel 7**: Subequipo, Componente, etc. (nuevo)

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: 
  - Agregados 4 estados de filtro (filterNivel4-7)
  - Agregados 4 useMemo para extraer niveles disponibles
  - Actualizado filtrado para incluir niveles 4-7
  - UI reorganizada en 2 filas de selectores
  - Actualizada función "Limpiar filtros"

**Beneficios:**
- ✅ Soporte completo para jerarquías complejas de equipos industriales
- ✅ Mayor granularidad en asignación de sensores IoT
- ✅ Filtrado preciso hasta el nivel más bajo de la estructura
- ✅ Escalabilidad para organizaciones con múltiples niveles organizacionales

**Compatibilidad:**
- ✅ Totalmente retrocompatible con jerarquías de 3 niveles existentes
- ✅ Los niveles adicionales son opcionales y solo se muestran si existen

---

### v2.17.5 - Fix Bucle Infinito Equipment Loading (14/01/2026)

**Fixes:**
- 🐛 **Bucle Infinito**: corregido bucle infinito en carga de equipment usando useRef para trackear estado de carga.
- ⚡ **Performance**: equipment solo se carga una vez al montar componente.
- 🔍 **useEffect Fix**: eliminada dependencia circular que causaba re-ejecuciones infinitas.
- ✅ **Logs Limpios**: consola ahora muestra solo 1 intento de carga en lugar de cientos.

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: agregado useRef flag para evitar cargas repetidas

**Problema Resuelto:**
- Console logs no se repiten infinitamente
- CPU no se sobrecarga con llamadas a Firestore repetidas
- Página responde correctamente sin lag

**Cambio Técnico:**
```typescript
const loadedRef = useRef(false) // Flag para evitar cargas repetidas
useEffect(() => {
  if (loadedRef.current || loadingEquipment) return
  loadedRef.current = true
  // ... lógica de carga
}, [equipmentStore, loadingEquipment])
```

---

### v2.17.4 - Fix Carga Equipment Autónoma (14/01/2026)

**Fixes:**
- 🔄 **Carga Autónoma**: SensorsPage ahora carga equipment directamente desde Firestore si el store global está vacío.
- 🎯 **Independencia**: no requiere navegar primero a otras páginas (Equipos, Dashboard) para tener datos.
- 💾 **Fallback Inteligente**: usa store global si está cargado, sino carga desde Firestore en background.
- 🔍 **Debug Mejorado**: logs de consola indican fuente de datos (store vs Firestore).
- ✅ **Feedback Visual**: indicadores de "Cargando equipos..." y "No hay equipos disponibles".

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: carga local de equipment + estado loading + mensajes UX

**Problema Resuelto:**
- Selectores de jerarquía (Planta/Sector/Área) ahora se llenan automáticamente
- Asignación de equipos funciona inmediatamente al entrar a página Sensores
- No depende de estado compartido entre páginas

---

### v2.17.3 - Selectores Jerarquía Independientes (14/01/2026)

**Fixes:**
- 🔓 **Selectores Independientes**: Planta, Sector y Área funcionan sin dependencia en cascada.
- ✅ **Sin Restricciones**: ningún selector se deshabilita, selección libre en cualquier nivel.
- 📋 **Opciones Completas**: cada selector muestra TODAS las opciones disponibles (no filtradas por otros niveles).
- 🎯 **Filtrado Flexible**: lógica AND que permite combinar filtros de cualquier nivel jerárquico.
- 🚫 **No Cascada Forzada**: eliminada lógica que obligaba a seleccionar Planta → Sector → Área en orden.

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: selectores independientes + opciones completas en cada nivel

**Beneficios:**
- Búsqueda más rápida de equipos
- No necesitas navegar toda la jerarquía si sabes el sector/área
- Filtros más intuitivos y flexibles

---

### v2.17.2 - Fix Autocomplete + UX Asignación (14/01/2026)

**Fixes:**
- 🔒 **Autocomplete Off**: inputs de búsqueda (dispositivos y equipos) no autocompletar con email del navegador.
- 🎨 **UX Asignación Mejorada**: botones contextuales ("Asignar equipo" → "Cambiar equipo" según estado).
- 💡 **Mensajes Ayuda**: tooltip "Selecciona un equipo de la lista arriba..." cuando no hay selección.
- ✅ **Feedback Visual**: mensajes de éxito (verde) y error (rojo) con fondos coloreados y mejores contrastes.
- 🔘 **Botón Condicional**: "Quitar asignación" solo visible si hay equipo asignado.

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: autocomplete="off" + type="search" + UX botones asignación

---

### v2.17.1 - Fix Filtro Búsqueda (14/01/2026)

**Fixes:**
- 🔍 **Botón Limpiar Filtro**: agregado botón X para limpiar búsqueda de dispositivos cuando hay texto.
- ⚠️ **Mensaje Alerta**: indicador visual si el filtro oculta todos los dispositivos ("No hay resultados, limpia el filtro").
- 🐛 **UX Mejorada**: evita confusión cuando los dispositivos desaparecen por filtro activo.

**Archivos Modificados:**
- `apps/pwa/src/pages/SensorsPage.tsx`: botón X + mensaje alerta en filtro búsqueda

---

### v2.17.0 - UI Sensores Mejorada + Delete Devices (14/01/2026)

**Mejoras Principales:**
- 🗑️ **Eliminar Dispositivos**: nueva función para eliminar dispositivos duplicados desde la PWA con confirmación.
- 📊 **Dashboard Estadísticas**: cards con totales (dispositivos, online, asignados) en vista principal.
- 🎨 **UI Reorganizada**: layout de 2 columnas (lista de dispositivos 380px + detalles flex).
- 🃏 **Cards Separadas**: UI modular con cards para Telemetría, Emparejar y WiFi AP.
- ⚡ **Fix Detección**: eliminado throttling de 2 segundos que bloqueaba actualizaciones real-time.
- 🔍 **Device Info**: lista mejorada mostrando deviceName, apSsid, IP, lastSeen para identificación visual.
- 🐛 **Fix Propagación**: botón eliminar con stopPropagation para evitar selección accidental.

**Mejoras Técnicas:**
- Logs de debug extensivos en `subscribeDevices()` para diagnóstico
- Error messages con troubleshooting steps (autenticación, reglas RTDB, ESP32)
- Función `deleteDevice(deviceId)` usando Firebase `remove()`
- Estado `deletingDevice` para feedback visual durante eliminación
- Interfaz `DeviceNode` extendida: +apSsid, +apIp, +deviceName, +mdns

**Archivos Modificados:**
- `apps/pwa/src/services/devicesRtdb.ts`: +deleteDevice(), sin throttling, +logs
- `apps/pwa/src/pages/SensorsPage.tsx`: UI completa rediseñada + función eliminar

**Flujo Eliminar:**
PWA (botón) → confirmación → deleteDevice(id) → Firebase remove() → actualización real-time

---

### v2.16.12 - Config AP Remota ESP32 (14/01/2026)

**Mejoras Principales:**
- 📡 **Configuración AP Remota**: nueva UI en página Sensores para configurar WiFi local (AP) de cada ESP32 desde la PWA.
- 🔐 **Seguridad WiFi**: soporte para SSID personalizado y contraseña WPA2 (mínimo 8 caracteres).
- 🔄 **Sincronización Real-Time**: ESP32 escucha cambios en Firebase RTDB y aplica configuración AP dinámicamente.
- 🛡️ **Modo Dual**: AP local siempre activo (AP+STA) mientras está conectado a WiFi de internet.
- 🧹 **Auto-limpieza**: firmware detecta y limpia SSID erróneos guardados en memoria.

**Archivos Nuevos:**
- `apps/pwa/src/services/apConfigRtdb.ts`: servicio Firebase para configuración AP
- Stream `apConfig` en ESP32 firmware para sincronización real-time

**Flujo:**
PWA (UI) → Firebase RTDB (`devices/{id}/apConfig`) → ESP32 (stream listener) → Aplica config AP

---

### v2.16.10 - Zoom Tiempo Real (11/01/2026)

**Mejoras Principales:**
- ⏱️ **Botón "Ahora"** en gráficos de serie temporal: centra el eje X alrededor del tiempo actual.
- 🔄 **Reset**: restablece el zoom al rango original.
- 🧩 **Sync automático**: script para mantener versión consistente (package/manifest/version.json/constantes).

---

### v2.16.9 - Sync Release (11/01/2026)

**Mejoras Principales:**
- 🔄 **Sincronización**: dependencias/lockfile alineados y versionado consistente en PWA (package/manifest/version.json).
- ♻️ **Service Worker**: bump de versión para forzar actualización en clientes.

---

### v2.16.8 - Gráficos Demo en PWA (11/01/2026)

**Mejoras Principales:**
- 📊 **Gráficos (10 opciones)**: `TelemetryChart` ahora soporta gauge, heatmap (matrix), candlestick (financial) y mixed, alineándose al demo.
- 🕒 **Eje temporal real**: los gráficos de serie usan escala `time` con `chartjs-adapter-date-fns`.
- 🎛️ **UI**: el selector en Sensores muestra las 10 opciones.

**Impacto:**
- ✅ La PWA puede renderizar los mismos tipos del demo (1–10)
- ✅ Mejor consistencia visual/UX entre demo y app

---

### v2.16.7 - Fix Gráfico Historial + Timestamps Telemetría (11/01/2026)

**Fixes Críticos:**
- 📊 **Gráfico historial**: Inicialización ahora depende de temperatura/humedad (no solo de `timeRange`) y evita loading infinito
- 🔧 **Validación numérica**: Se acepta `0` como valor válido y se evita bloquear si los datos llegan después del primer render
- 🕒 **Fecha/hora telemetría**: Normalización de `devices/{id}/telemetry/*/timestamp` (segundos → ms)
- 📦 **Versioning**: `version.json` actualizado a 2.16.7 para sincronizar banner/servidor

**Mejoras Técnicas:**
- Normalización de valores y timestamps en `devicesRtdb` para consistencia con `sensorsRtdb`
- Reset del historial cuando cambia `timeRange` o el equipo

**Impacto:**
- ✅ Gráficos de telemetría ahora se renderizan siempre que haya valores numéricos
- ✅ Loading state correcto: termina cuando datos están listos
- ✅ Banner versión desaparece tras actualizar

---

### v2.16.5 - Fix Timestamps Simulados + TypeScript Warnings (11/01/2026)

**Fixes Críticos:**
- **Timestamps simulados**: Eliminados timestamps inválidos (2062, 1970) que generaban ~500 warnings en consola
- **Console flooding**: Eliminado console.warn que inundaba la consola con "Fecha fuera de rango"
- **TypeScript warnings**: Corregidos 21 problemas de compilación (parámetros no usados, undefined values, tipos ChartJS)

**Mejoras Técnicas:**
- **useTelemetryHistory**: Prefijo `_` para parámetro `equipmentId` no utilizado (indica intencional)
- **TelemetryChart**: 
  - Agregado `??` nullish coalescing para valores undefined en normalize()
  - Non-null assertion `!` para acceso a grouped object
  - Suprimidos errores tipo ChartJS con `@ts-expect-error` (funcionan correctamente en runtime)
- **SensorsPage**:
  - Fix operación aritmética: `timestamp * 1000` solo si es number
  - Eliminado console.warn flooding para timestamps fuera de rango
  - Retorno silencioso `'—'` en lugar de log masivo

**Impacto:**
- Consola limpia sin warnings masivos
- Build TypeScript sin errores
- Mismo comportamiento funcional que v2.16.4
- Performance sin cambios (optimización es visual/logging)

---

### v2.16.4 - Carga Asíncrona del Gráfico + Banner Fix (11/01/2026)

**Fixes Críticos:**
- **Banner actualización**: Agregado console.log para diagnosticar versión desactualizada en service worker
- **Carga gráfico**: Historial se genera de forma asíncrona sin bloquear render inicial
- **Performance mejorada**: Punto actual se muestra inmediatamente, historial completo se carga en background

**Mejoras de UX:**
- **Skeleton animado**: Barras pulsantes con gradiente azul durante carga del gráfico
- **Spinner centralizado**: Mensaje "Generando historial..." con indicador de progreso
- **Respuesta instantánea**: Gráfico responde inmediatamente en lugar de bloquear 500ms

**Detalles técnicos:**
- useTelemetryHistory refactorizado: `setTimeout(..., 0)` para carga en siguiente tick
- Primer render muestra punto actual + skeleton
- Buffer histórico se genera en background sin afectar interactividad
- Loading state: `isLoading = data.length < 3` puntos

**Bundle:**
- TelemetryChart: +0.8 kB (skeleton loader)
- Total precache: ~2010 KiB

### v2.16.3 - Timestamps con Hora Actual Real (11/01/2026)

### v2.13.2 - UX Mejorada en Sensores (Lista Scrollable)

**Mejoras de UX:**
- **Lista scrollable visual**: Reemplazado dropdown oculto por lista completa con toda la información visible
- **Contexto visual inmediato**: Cada equipo muestra nombre, código, ubicación jerárquica, estado y criticidad
- **Sin memorización requerida**: No necesitas saber códigos de memoria, toda la info está a la vista
- **Filtros intuitivos**: Badges de colores para estado y criticidad (🔴 Alta, 🟡 Media, 🟢 Baja)
- **Navegación por ubicación**: Icono 📍 muestra ruta jerárquica completa (Planta > Sector > Área)
- **Selección visual**: Border azul indica equipo seleccionado

**Detalles técnicos:**
- Límite de 100 equipos visibles por performance, con indicador si hay más
- Búsqueda en tiempo real filtra mientras escribes (opcional)
- Scroll interno con altura máxima de 300px

### v2.13.1 - Migración a Database Secret (Legacy Auth)

**Correcciones Críticas:**
- **Usuarios anónimos eliminados**: Solución a creación masiva de cientos de usuarios Auth
- **Database Secret implementado**: Método legacy pero funcional para IoT write-only
- **Script de limpieza**: firebase-admin SDK para eliminación batch automatizada

**Técnico:**
- Firmware ESP32 eliminó `Firebase.signUp()` completamente
- Config con `FIREBASE_DATABASE_SECRET` en lugar de API Key
- Reglas RTDB permisivas validando estructura de datos

### v2.11.0 - Emparejamiento de Sensores (IoT)

**Nuevas Características:**
- **Emparejamiento desde la PWA**: nueva ruta `/sensors` para asignar/desasignar ESP32↔equipo (sin editar firmware por equipo)
- **Registro de dispositivos**: `devices/{deviceId}` en RTDB con `online/lastSeen` y `assignedEquipmentId`

**Técnico:**
- Firmware ESP32: `deviceId` por MAC, escucha `assignedEquipmentId` por stream y persiste en NVS
- Reglas RTDB listas para deploy (`database.rules.json`) y registradas en `firebase.json`

### v2.10.0 - IoT Predictivo (RTDB + Incidencias automáticas)

**Nuevas Características:**
- **Módulo Predictivo**: vista dedicada por equipo con riesgo, confianza y recomendación
- **Integración RTDB**: lectura de `sensors/{equipmentId}` y histórico `readings` para tendencia
- **Incidencias predictivas**: creación automática en Firestore cuando el riesgo es alto/crítico (anti-duplicados)

**Técnico:**
- Firmware ESP32 versionado sin secretos (config de ejemplo) para colaboración segura
- Sincronización de versión en app (`APP_VERSION`) + `public/version.json` + manifest

### v2.9.0 - Vista Pública Mejorada y Email Optimizado

**Nuevas Características:**
- **Lightbox fullscreen**: Ampliar fotos con navegación prev/next y contador
- **Notas en vista pública**: Mostrar notas al escanear QR (carga desde localStorage)
- **Historial visible**: Últimas 5 incidencias con fecha, prioridad y estado
- **Botón compartir**: Web Share API con fallback a clipboard
- **QR mejorado**: 120px, nivel H de corrección de errores con texto explicativo

**Mejoras de UX:**
- **Email mobile-friendly**: Formato limpio con caracteres Unicode seguros (•, →, ━, ✓)
- **Líneas cortas**: 22 caracteres para evitar scroll horizontal en móviles
- **Nota técnica discreta**: Estilo "letra chica" al final del email
- **Layout responsive**: Mobile-first con header sticky en vista pública
- **Secciones organizadas**: Ubicación, datos técnicos, galería, notas, historial

**Correcciones:**
- **Fix URL del QR**: Cambiar de `/equipment/` a `/mantenimiento-planta/public/equipment/`
- **Fix TypeScript**: Eliminar código duplicado en PublicEquipmentView
- **Fix spread operator**: Validación Array.isArray antes de usar spread
- **Conditional rendering**: Notas e incidencias solo se muestran si existen

**Técnico:**
- Cargar notas desde localStorage en vista pública (compatible con múltiples usuarios)
- Galería de fotos con grid adaptativo (2→3→4 cols)
- Footer informativo con limitaciones de vista pública

### v2.8.0 - Editor de Anotaciones y Notas Mejoradas

- **Notas editables**: Botones editar/eliminar en cada nota con confirmación
- **WebP automático**: Conversión automática de todas las fotos a WebP (calidad 88%)
- **Editor de anotaciones**: Canvas para dibujar formas punto a punto en fotos
- **Formas personalizables**: Transparencia 0-100%, curvatura esquinas 0-100%, colores
- **Texto en fotos**: Herramienta para añadir texto con tamaño ajustable (12-72px)
- **Guardado inteligente**: Opción de reemplazar foto original o agregar como nueva
- **Sistema compartir mejorado**: Email HTML, selector notas, vista pública sin auth
- **Reducción de peso**: Fotos optimizadas automáticamente para menor consumo

### v2.6.1 - UX Mejorada (Filtros y Persistencia)

- **Filtro de selección**: Equipos seleccionados en jerarquía se filtran automáticamente en módulo equipos
- **Badge informativo**: Indicador visual cuando se filtra por selección con botón "Ver todos"
- **Persistencia de expansión**: Estado de nodos expandidos se mantiene al salir de jerarquía
- **Persistencia de equipos**: Lista de equipos por nodo también persiste su estado expandido
- **Navegación mejorada**: Query params `?selected=id1,id2,id3` para filtrar equipos
- **Storage local**: Estados guardados en localStorage para mejor UX

### v2.6.0 - Base + Expansiones

- **Estructura base**: 862 nodos existentes marcados como estructura base con fecha común
- **Badge "Base"**: distintivo azul con icono Clock para nodos de estructura original
- **Badge "Nuevo"**: distintivo verde con icono Sparkles para expansiones futuras
- **Tooltips informativos**: fechas de creación visibles al pasar sobre badges
- **Script de migración**: herramienta para marcar estructura base (`mark_base_hierarchy.js`)
- **Auto-clasificación**: nuevos nodos marcados automáticamente como expansiones
- **Auditoría temporal**: seguimiento visual del crecimiento organizacional

### v2.5.0 - Jerarquía + Equipos Integrados

- **Equipos en jerarquía**: visualización de equipos asociados a cada nodo con badge contador
- **Lista expandible**: ver equipos por nodo con indicador de fotos
- **Selección múltiple**: checkboxes para seleccionar equipos desde jerarquía
- **Barra flotante**: contador y botón compartir para equipos seleccionados
- **Navegación mejorada**: botón directo para ver equipo en módulo equipos
- **Compartir integrado**: flujo completo de compartir desde jerarquía

### v2.4.0 - Equipos con Fotos y QR

- **Sistema de fotos**: múltiples fotos por equipo con upload y galería
- **Preview fullscreen**: visualización de fotos con navegación anterior/siguiente
- **QR codes visuales**: generación de códigos QR con descarga SVG
- **Fotos en compartir**: opción para incluir fotos en exportación
- **Indicadores**: badge con cantidad de fotos en tarjetas de equipos

### v2.3.0 - Gestión Avanzada de Equipos

- **Acciones masivas**: cambio de estado, copiar códigos, exportar CSV de selección
- **Gestión de mantenimiento**: botón rápido en tarjetas con modal (tipo local/externo, responsable, notas)
- **Sistema de compartir/exportar**: modal configurable con opciones de datos (básicos, historial, notas, URLs QR)
- **Formatos múltiples**: exportación en PDF/texto, CSV, JSON
- **Métodos de envío**: descarga, email, Web Share API (móvil)
- **UI mejorada**: tarjetas más compactas, badges de estado visible en grid

### v2.2.31 - Equipos desde Jerarquía

- Equipos: sincronización automática desde Jerarquía (nivel >= 5, con código)
- Equipos: muestra `hierarchyPath` y botón “Ver jerarquía” (deep-link con foco)
- Equipos: control de sync (`syncExcluded`) y eliminación lógica (`deleted`) para evitar recreación

### v2.2.30 - Roles + Buscador Jerarquía

- Usuarios: habilita rol `usuario` (no admin) end-to-end
- Seguridad: reglas `/users` reforzadas contra escalamiento y guards de rutas admin
- Jerarquía Admin: buscador mejorado (múltiples términos + conteo real de matches)

### v2.2.29 - Jerarquía: Conteo de hijos + Pages

- Jerarquía Admin: muestra cantidad de hijos por nodo en el árbol

### v2.2.28 - Jerarquía Extendida + Pruebas en Pages

- Sincronización para pruebas vía GitHub Pages (workflow de deploy activo en `main`)
- Versionado/fecha alineados (source of truth)

### v2.2.27 - Jerarquía Extendida (695 nodos)

Ampliación del mandante de jerarquía para incluir subárboles adicionales (ej. Planta YAL), manteniendo consistencia 1:1 en Firestore.

#### 🌲 Datos
- Dataset extendido `EXPECTED_CANONICAL_EXTENDED.json` (695 nodos activos)
- Reconciliación Firestore sin extras, duplicados ni huérfanos

#### 🧰 Herramientas
- Scripts para comparar/mergear MD → dataset extendido e importar/reconciliar en admin

### v2.2.26 - Jerarquía Optimizada (Admin + Cache)

Mejoras de administración, performance y seguridad operativa del sistema de jerarquías.

#### 🧭 Selector
- Breadcrumb del selector muestra nombres reales del path seleccionado

#### ⚡ Performance
- Cache TTL real (~5 min) para árbol, hijos y paths (menos lecturas/latencia)

#### 🛡️ Admin seguro
- Activar/desactivar nodos desde edición (los inactivos se muestran en el árbol admin)
- Eliminación en cascada segura cuando hay descendientes (evita huérfanos)

### v2.2.25 - Título/Ubicación por Par + Exportación Agrupada

Mejora del flujo por par para permitir identificación fina y una exportación más ordenada.

#### 🧾 Pares (metadatos)
- Título opcional por par
- Ubicación por par con 3 modos: usar general, seleccionar desde jerarquía, o escribir manual
- Sugerencias de títulos/ubicaciones ya usados en la evidencia

#### 🖨️ PDF
- Ordena/agrupa las páginas por título y ubicación del par

### v2.2.24 - Evidencias Fotográficas (Multi-foto) + Informe Técnico

Evolución del módulo de evidencias con soporte multi-foto por par ANTES/DESPUÉS, anotación avanzada y exportación en formato informe técnico.

#### 📷 Evidencias Fotográficas
- Pares ANTES/DESPUÉS con múltiples fotos por par (compatible con el modelo legado)
- Selección de foto a comparar/anotar dentro del par
- Eliminación de par completa (fotos + datos) con reindexación

#### 🖊️ Anotación
- Anotador con zoom/pan (rueda + gesto) y edición post-creación

#### 🧾 PDF (Informe Técnico)
- Exportación tipo informe técnico, 1 par por página
- Soporte de páginas adicionales cuando hay múltiples fotos por par

#### 🔁 Flujo de verificación
- Opción “Quitar verificación” para permitir re-editar evidencias ya verificadas

### v2.1.7 - Reconciliación Mandante

Refuerzo de gobernanza de datos y estabilidad del árbol jerárquico.

#### 🗂️ Mandante y verificación
- Dataset canónico derivado de los extractos verificados (438 códigos únicos)
- Scripts para verificar y reconciliar Firestore contra el mandante

#### 🛡️ Integridad de datos
- Bloqueo de `codigo` duplicado (nodos activos) en creación/edición

#### 🔄 Actualización y cache
- Soporte de sincronización/refresco y detección de actualizaciones
- Version-check para avisar “Nueva versión disponible”

### v1.0.4 - Corrección Completa de Mapa

Correcciones definitivas para experiencia de mapas y calidad visual.

#### 🔧 Correcciones
- ❌ Fix definitivo errores preventDefault (addEventListener passive:false)
- 🖼️ Resolución original con key para re-render
- 👁️ Mapa visible inmediatamente en modo vista
- 🎯 Reset automático zoom/posición al cambiar modos

#### ✨ Mejoras UI
- 📋 Labels de zonas simplificados (sin iconos)
- 🔤 Tipografía mejorada en badges
- 🟡 Contador de incidencias más visible
- 🗄️ Bordes optimizados (border-2)

#### 📊 Métricas
```
TypeScript Errors: 0
Bundle: ~1066 KiB
Chunks Separados: 3 (lazy loading)
Build Time: ~10s
Zoom Range: 0.5x - 10x
Image Quality: Original (sin compresión)
```

---

### v1.0.2 - Optimizaciones de Rendimiento

Optimizaciones críticas de rendimiento con debounce en búsquedas y code splitting para reducir el bundle inicial.

#### ⚡ Optimizaciones Implementadas
- 🔍 Debounce (300ms) en búsquedas de IncidentsPage y PreventivePage
- 📦 Code Splitting con React.lazy() para MapPage, PreventivePage y SettingsPage
- 🚀 Chunks separados (~73 KB) que se cargan bajo demanda
- 🛠️ Función debounce genérica en utilidades
- 💾 Menor uso de CPU y mejor experiencia en búsquedas

#### 📊 Métricas
```
TypeScript Errors: 0
Bundle Principal: ~1065.77 KiB
Chunks Separados: 
  - MapPage: 34.08 KB (10.24 KB gzip)
  - PreventivePage: 26.02 KB (6.94 KB gzip)
  - SettingsPage: 13.43 KB (3.87 KB gzip)
Build Time: ~10.06s
Modules: 1,817
Precache Entries: 20 (antes 16)
```

---

### v1.0.1 - Mejoras de Mapas y Visualización

Mejoras significativas en la experiencia del usuario al trabajar con mapas de planta, marcadores de incidencias y visualización de zonas.

#### ✨ Mejoras Implementadas
- 🔍 Zoom optimizado (0.5x - 10x) con controles más suaves
- 📍 Marcadores más grandes y visibles con tooltips
- 🎨 Zonas con mejor contraste y visibilidad
- 🖱️ Efectos hover mejorados en toda la interfaz
- ♿ Mejor accesibilidad con aria-labels

#### 📊 Métricas
```
TypeScript Errors: 0
Bundle Size: ~1055.70 KiB
Build Time: ~9.30s
Modules: 1,816
Zoom Range: 0.5x - 10x (mejorado)
```

---

### v1.0.0 - Primera Versión de Producción

Esta es la primera versión estable y lista para producción del Sistema de Levantamiento de Incidencias en Planta.

#### ✨ Características Principales
- ✅ Gestión completa de incidencias
- ✅ Mantenimiento preventivo
- ✅ Editor de mapas/zonas
- ✅ Gestión de equipos
- ✅ Sistema de roles y permisos
- ✅ PWA installable
- ✅ Validación robusta con Zod
- ✅ Logging estructurado
- ✅ Rate limiting implementado

#### 📊 Métricas
```
TypeScript Errors: 0
Bundle Size: 1055.70 KiB
Build Time: 9.30s
Modules: 1,816
Coverage: Validación 71%, Logging 100%
```

---

## 📖 Sistema de Versionado (Semantic Versioning)

Este proyecto sigue [Semantic Versioning 2.0.0](https://semver.org/lang/es/)

### Formato: MAJOR.MINOR.PATCH

#### MAJOR (X.0.0)
Cambios **incompatibles** con versiones anteriores.

**Ejemplos**:
- Cambio completo de arquitectura
- Migración de Firebase a otro backend
- Cambio de estructura de base de datos
- Eliminación de APIs públicas

**Cuándo incrementar**:
```bash
# Cambio breaking: Eliminar soporte para roles antiguos
v1.2.5 → v2.0.0
```

#### MINOR (x.Y.0)
Nueva funcionalidad **compatible** con versiones anteriores.

**Ejemplos**:
- Agregar nueva página o feature
- Implementar code splitting
- Agregar dashboard de analytics
- Nueva integración (Sentry, etc.)
- Mejoras de performance significativas

**Cuándo incrementar**:
```bash
# Nueva feature: Implementar code splitting
v1.0.0 → v1.1.0

# Nueva feature: Dashboard de reportes
v1.1.0 → v1.2.0
```

#### PATCH (x.y.Z)
Corrección de errores **compatible**.

**Ejemplos**:
- Corregir errores de TypeScript
- Fix de bugs en formularios
- Ajustes de UI/UX menores
- Corrección de validaciones
- Optimizaciones pequeñas

**Cuándo incrementar**:
```bash
# Bugfix: Corregir validación de fecha
v1.0.0 → v1.0.1

# Bugfix: Arreglar búsqueda en móvil
v1.0.1 → v1.0.2
```

---

## 🔄 Flujo de Versionado

### 1. Desarrollo Local
```bash
# Trabajar en feature branch
git checkout -b feature/code-splitting

# Hacer commits descriptivos
git commit -m "feat: implement lazy loading for MapPage"
git commit -m "feat: add Suspense with loading state"
git commit -m "perf: reduce bundle by 300KB"
```

### 2. Preparar Release
```bash
# Actualizar versión en package.json
npm version minor  # Para nueva feature (1.0.0 → 1.1.0)
# npm version patch  # Para bugfix (1.0.0 → 1.0.1)
# npm version major  # Para breaking change (1.0.0 → 2.0.0)

# Actualizar CHANGELOG.md
# Agregar entrada con todos los cambios
```

### 3. Crear Tag de Git
```bash
# Crear tag anotado
git tag -a v1.1.0 -m "Release v1.1.0 - Code Splitting Implementation"

# Push con tags
git push origin main --tags
```

### 4. Build de Producción
```bash
# Build optimizado
npm run build

# Verificar bundle size
ls -lh dist/assets/

# Deploy a Firebase Hosting
firebase deploy
```

---

## 📝 Convenciones de Commits

Seguir [Conventional Commits](https://www.conventionalcommits.org/es/)

### Tipos de Commits

#### feat: Nueva característica
```bash
git commit -m "feat: add debounce to incidents search"
git commit -m "feat(preventive): implement task execution form validation"
```

#### fix: Corrección de error
```bash
git commit -m "fix: correct PropertyKey type in validation"
git commit -m "fix(equipment): resolve search debounce issue"
```

#### perf: Mejora de performance
```bash
git commit -m "perf: implement code splitting with React.lazy()"
git commit -m "perf: reduce bundle size by 300KB"
```

#### refactor: Refactorización
```bash
git commit -m "refactor: extract validation logic to utility"
git commit -m "refactor(logger): improve error context handling"
```

#### docs: Documentación
```bash
git commit -m "docs: add code splitting guide"
git commit -m "docs: update README with new features"
```

#### style: Cambios de formato
```bash
git commit -m "style: format code with prettier"
git commit -m "style: fix indentation in LoginPage"
```

#### test: Tests
```bash
git commit -m "test: add unit tests for Zod schemas"
git commit -m "test: implement E2E tests for incident creation"
```

#### chore: Mantenimiento
```bash
git commit -m "chore: update dependencies"
git commit -m "chore: configure prettier and ESLint"
```

---

## 🗺️ Roadmap de Versiones

### v1.0.0 ✅ ACTUAL
**Estado**: Liberado - 24 de diciembre de 2024
- ✅ Features core completos
- ✅ Validación en formularios críticos
- ✅ Logging estructurado 100%
- ✅ 0 errores TypeScript

### v1.0.1 (Hotfix si necesario)
**Estimado**: Enero 2025
- 🐛 Corrección de bugs reportados en producción
- 🐛 Ajustes menores de UI/UX
- 🐛 Optimizaciones de performance pequeñas

### v1.1.0 (Próxima minor)
**Estimado**: Enero 2025 (2 semanas)
**Focus**: Performance y validación completa

#### Features Planeados
- 🎯 **Code Splitting** (-300KB bundle)
  - Lazy load de MapPage
  - Lazy load de PreventivePage
  - Lazy load de SettingsPage
  - Suspense con loading states

- 🎯 **Validación Completa**
  - PreventivePage (2 formularios)
  - SettingsPage
  - ZoneEditor
  - PolygonZoneEditor

- 🎯 **Rate Limiting**
  - Debounce en IncidentsPage
  - Debounce en PreventivePage
  - Throttle en operaciones pesadas

**Entregables**:
- Bundle reducido a ~750KB
- 100% de formularios validados
- Documentación actualizada

### v1.2.0
**Estimado**: Febrero 2025 (1 mes)
**Focus**: Testing y monitoring

#### Features Planeados
- 🧪 **Testing**
  - Tests unitarios (Vitest)
  - Tests E2E (Playwright)
  - Coverage >80%

- 📊 **Monitoring**
  - Integración con Sentry
  - Error tracking en producción
  - Performance monitoring
  - Alertas automáticas

- ⚡ **Optimización Avanzada**
  - Service Worker optimizado
  - Prefetching inteligente
  - Image lazy loading

**Entregables**:
- Suite de tests completa
- Monitoreo en tiempo real
- Bundle <800KB

### v1.3.0
**Estimado**: Marzo 2025
**Focus**: Features avanzadas

#### Features Planeados
- 📈 **Dashboard Analytics**
  - Gráficos de incidencias
  - KPIs de mantenimiento
  - Reportes personalizados

- 📤 **Exportación**
  - Exportar a PDF
  - Exportar a Excel
  - Scheduled reports

- 🔔 **Notificaciones**
  - Push notifications
  - Sistema de notificaciones in-app
  - Alertas por email

**Entregables**:
- Dashboard interactivo
- Sistema de reportes
- Notificaciones funcionando

### v2.0.0
**Estimado**: Futuro (6+ meses)
**Focus**: Major refactor (si necesario)

#### Cambios Potenciales
- Migración a React 19
- Actualización de Firebase v12
- Nueva arquitectura de datos
- Breaking changes si necesario

---

## 📊 Tracking de Versiones

### Registro de Cambios

| Versión | Fecha | Tipo | Descripción | Bundle Size |
|---------|-------|------|-------------|-------------|
| **1.0.0** | 2024-12-24 | MAJOR | 🎉 Release inicial | 1055.70 KB |
| 1.1.0 | TBD | MINOR | Code splitting + validación | ~750 KB |
| 1.2.0 | TBD | MINOR | Testing + monitoring | <800 KB |
| 1.3.0 | TBD | MINOR | Analytics + exportación | TBD |

### Cambios Acumulativos

```
v1.0.0 → v1.1.0
  + Code splitting (-300KB)
  + Validación completa
  + Rate limiting completo
  = Mejora de performance ~50%

v1.1.0 → v1.2.0
  + Tests (coverage >80%)
  + Sentry integration
  + Service Worker optimizado
  = Mejor debugging y confiabilidad

v1.2.0 → v1.3.0
  + Dashboard analytics
  + Exportación PDF/Excel
  + Push notifications
  = Más valor para usuarios finales
```

---

## 🛠️ Comandos Útiles

### Verificar Versión Actual
```bash
# Ver versión en package.json
npm pkg get version

# Ver último tag
git describe --tags --abbrev=0

# Ver historial de versiones
git tag -l
```

### Incrementar Versión
```bash
# Patch (1.0.0 → 1.0.1)
npm version patch -m "Release v%s - Hotfix"

# Minor (1.0.0 → 1.1.0)
npm version minor -m "Release v%s - New Features"

# Major (1.0.0 → 2.0.0)
npm version major -m "Release v%s - Breaking Changes"
```

### Crear Release
```bash
# 1. Actualizar versión
npm version minor

# 2. Actualizar CHANGELOG.md manualmente

# 3. Commit y tag
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for v1.1.0"
git tag -a v1.1.0 -m "Release v1.1.0"

# 4. Push
git push origin main --tags
```

### Build y Deploy
```bash
# Build local
npm run build

# Preview local
npm run preview

# Deploy a Firebase
firebase deploy --only hosting
```

---

## 📚 Referencias

- [Semantic Versioning](https://semver.org/lang/es/)
- [Conventional Commits](https://www.conventionalcommits.org/es/)
- [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)
- [Git Tagging](https://git-scm.com/book/es/v2/Fundamentos-de-Git-Etiquetado)

---

**Última actualización**: 24 de diciembre de 2024  
**Mantenido por**: Equipo de Desarrollo  
**Versión actual**: **v1.0.0**
# #   2 . 4 8 . 1 3 
 
 -   U n i f i c a c i � n   d e   v i s u a l i z a c i � n   d e   d e t a l l e   d e   i n c i d e n c i a s   e n   M a p P a g e . 
 -   R e e m p l a z o   d e   I n c i d e n t Q u i c k V i e w   p o r   I n c i d e n t D e t a i l . 
 -   V e r i f i c a c i � n   y   e s t a n d a r i z a c i � n   d e   m o d a l e s   a   8 5 v w   e n   m � v i l . 
 
 
 # #   2 . 4 8 . 1 4 
 
 -   C o r r e c c i � n   c r � t i c a   e n   I n c i d e n t D e t a i l   ( e r r o r   d e   s i n t a x i s   e n   b u i l d ) . 
 -   A j u s t e   f i n a l   d e   l a y o u t   m o d a l   m � v i l   ( 9 8 v w ,   h e a d e r / f o o t e r   s t i c k y ) . 
 
 
 # #   2 . 4 8 . 1 5 
 
 -   M e j o r a   v i s u a l   e n   l i s t a   d e l   D a s h b o a r d   ( d e t a l l e   d e   r e p o r t e r o / a s i g n a d o ) . 
 -   A j u s t e   d e   c o n t e n e d o r   p r i n c i p a l   ( M a i n L a y o u t )   p a r a   e v i t a r   d e s b o r d a m i e n t o   h o r i z o n t a l . 
 -   S i n c r o n i z a c i � n   d e   v e r s i o n e s . 
 
 
 # #   2 . 4 8 . 1 6 
 
 -   D a s h b o a r d :   m o s t r a r   n o m b r e ,   r o l   y   p r o v e e d o r   d e   a u t e n t i c a c i � n   e n   r e p o r t a d o / a s i g n a d o . 
 -   A j u s t e   d e   t a r j e t a s   d e l   d a s h b o a r d   a   a n c h o   c o m p l e t o   e n   m � v i l . 
 
 
 # #   2 . 4 8 . 1 7 
 
 -   F i x :   e v i t a   R e f e r e n c e E r r o r   e n   D a s h b o a r d   ( o r d e n   d e   r e c e n t I n c i d e n t s ) . 
 
 
 # #   2 . 4 8 . 1 8 
 
 -   D a s h b o a r d   m � v i l :   t a r j e t a s   a   a n c h o   c o m p l e t o   y   e t i q u e t a s   c o n   s a l t o   d e   l � n e a . 
 -   R e p o r t a d o / A s i g n a d o :   m o s t r a r   t e x t o   c o m p l e t o   s i n   t r u n c a d o . 
 
 
 # #   2 . 4 8 . 1 9 
 
 -   I n c i d e n c i a s :   c o n t e o   y   f i l t r o   d e   \ 
 
 M i s 
 
 a s i g n a d a s \   s e g � n   u s u a r i o   l o g e a d o . 
 
 
 # #   2 . 4 8 . 2 0 
 
 -   I n c i d e n c i a s :   a s i g n a d a s   i n c l u y e   t o d a s   l a s   a s i g n a d a s   n o   c e r r a d a s . 
 -   D e t a l l e :   p e r m i t i r   a s i g n a r   t � c n i c o s   c o n   p e r m i s o   d e   a s i g n a c i � n . 
 -   A u t o - a s i g n a c i � n   c o r r e g i d a   ( r e f e r e n c i a   a   p e r m i s o s ) . 
 
 
 # #   2 . 4 8 . 2 1 
 
 -   I n c i d e n c i a s :   f i l t r o s   y   c o n t e o s   d e   c r e a d a s   p o r   u s u a r i o . 
 -   A d m i n / s u p e r v i s o r :   s e l e c t o r   d e   c r e a d o r . 
 -   C r e a r   i n c i d e n c i a :   o p c i � n   d e   a s i g n a r s e   a   s �   m i s m o . 
 
 
 # #   2 . 4 8 . 2 2 
 
 -   E s c a l a   g l o b a l   d e   U I   ( r e m )   p a r a   r e d u c i r   t a m a � o s   e n   t o d a   l a   P W A . 
 
 
 # #   2 . 4 8 . 2 3 
 
 -   M a p a :   m o d a l   d e   z o n a   c o n   l i s t a   d e   i n c i d e n c i a s   y   a c c e s o   a   d e t a l l e . 
 
 
 # #   2 . 4 8 . 2 4 
 
 -   I n c i d e n c i a s :   v i s i b i l i d a d   u n i f i c a d a   p o r   r o l   ( a d m i n / s u p e r v i s o r   v e n   t o d o ;   o t r o s   s o l o   p r o p i a s / a s i g n a d a s ) . 
 
 
 # #   2 . 4 8 . 2 5 
 
 -   S i n c r o n i z a c i � n   d e   e s t a d o s :   s u s c r i p c i � n   � n i c a   g l o b a l   p a r a   i n c i d e n c i a s . 
 -   M a p a   u s a   l i s t a   a c t i v a   d e r i v a d a   d e l   s t o r e   g l o b a l . 
 
 
 # #   2 . 4 8 . 2 6 
 
 -   N o t i f i c a c i o n e s   f o r e g r o u n d :   i n c l u y e n   U R L   y   n a v e g a n   a l   h a c e r   c l i c k . 
 
 
 # #   2 . 4 8 . 2 7 
 
 -   N o r m a l i z a c i � n   d e   d a t o s   d e   u s u a r i o   ( n o m b r e / r o l / p r o v e e d o r )   e n   i n c i d e n c i a s . 
 
 
 # #   2 . 4 8 . 2 8 
 
 -   V a l i d a c i � n   d e   u b i c a c i � n   e n   m a p a   a l   c r e a r   i n c i d e n c i a s . 
 
 
 # #   2 . 4 8 . 2 9 
 
 -   R e g l a s :   p e r m i t i r   a u t o - a s i g n a c i � n   d e l   r e p o r t a d o r . 
 -   D e t a l l e :   f e e d b a c k   a l   a s i g n a r   t � c n i c o . 
 
 
 # #   2 . 4 8 . 3 0 
 
 -   A s i g n a c i � n :   n o r m a l i z a   t � c n i c o   a   s t r i n g   y   e v i t a   o b j e t o s   e n   F i r e s t o r e . 
 
 
 # #   2 . 4 8 . 3 1 
 
 -   A s i g n a c i � n :   f i l t r a   t � c n i c o s   i n v � l i d o s   y   p r e s e l e c c i o n a   u n o   d i s p o n i b l e . 
 
 
 