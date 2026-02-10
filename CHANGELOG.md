# 📋 CHANGELOG - Sistema de Mantenimiento PWA

Todas las mejoras notables de este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [2.47.9] - 2026-02-10

### 🧭 Rangos Globales del Modulo

#### Cambios
- **Rangos globales**: Los rangos de peso por calibre ahora se guardan a nivel del modulo y aplican a todas las plantillas.
- **Plantillas limpias**: Las plantillas solo guardan gates (ya no arrastran rangos).
- **Guardar rangos globales**: Boton "Guardar rangos" ahora persiste globalmente.

## [2.47.8] - 2026-02-10

### 🔒 Turnos Fijos

#### Cambios
- **Turnos predefinidos**: En carga de archivos y configuración de análisis, el turno ahora se elige desde una lista fija (sin texto libre).

## [2.47.7] - 2026-02-10

### 📅 Calendario Grader + Resumen Diario

#### Añadido
- **Calendario dedicado**: Vista mensual para uploads Grader con conteo por dia y turnos.
- **Resumen por turno**: Boton para calcular piezas y P0% desde archivos del turno.
- **Carga directa al analisis**: Boton "Cargar" lleva al analisis con fecha+turno preseleccionados.

#### Cambios
- **Auto-carga por URL**: El analisis puede cargar un turno directamente con `?date=YYYY-MM-DD&shift=...&autoload=1`.

## [2.47.6] - 2026-02-10

### 📂 Calendario con Storage + Rangos por Dispositivo

#### Añadido
- **Uploads con Storage**: Cada archivo subido se guarda en Firebase Storage y queda referenciado en el calendario.
- **Cargar turno desde calendario**: Selecciona fecha+turno y carga automáticamente los archivos guardados para análisis.
- **Rangos por dispositivo**: Los rangos personalizados se guardan automáticamente por `deviceId` y se recargan al abrir.

#### Seguridad
- **Reglas Firestore**: Nueva colección `graderDeviceConfigs`.
- **Reglas Storage**: Nueva ruta `graderUploads/**` para Excel.

## [2.47.5] - 2026-02-10

### 📅 Calendario de Uploads + Turnos

#### Añadido
- **Uploads persistidos**: Cada archivo se guarda automáticamente en Firestore al subirlo.
- **Calendario de archivos**: Vista agrupada por fecha con conteo de archivos.
- **Turno automático editable**: Se infiere por hora (día/noche) y puede modificarse manualmente.
- **Turno objetivo**: Permite agrupar archivos por día+turno aunque los tiempos no coincidan.

#### Cambios
- **Pasos independientes**: Se puede navegar entre Carga, Config. Gates y Dashboard sin bloqueo.
- **Guardar rangos**: Botón para guardar rangos personalizados en plantillas.
- **Reglas Firestore**: Nueva colección `graderUploads` habilitada.

## [2.47.4] - 2026-02-10

### ⚙️ Calibres Personalizados

#### Añadido
- **Agregar calibres**: Ahora puedes crear nuevos calibres en “Rangos de Peso por Calibre” con sus gramos min/max.
- **Editar calibre**: El nombre del calibre es editable y se usa en el selector de gates.
- **Eliminar calibre**: Cada rango puede eliminarse si ya no se utiliza.
- **Orden por gramos**: Los rangos se ordenan automaticamente por min gramos (ascendente).

## [2.47.3] - 2026-02-10

### ⚙️ Rangos de Peso Persistentes

#### Añadido
- **Plantillas con rangos personalizados**: Las plantillas de gates ahora guardan y restauran los rangos de peso editados.
- **Indicador en plantillas**: Se muestra la etiqueta "Rangos" cuando una plantilla incluye rangos personalizados.

## [2.47.2] - 2026-02-09

### 🔧 Persistencia de Sesiones y Clasificación por Día

#### Correcciones
- **Fix Firestore `setDoc` con `undefined`**: Corregido error `Unsupported field value: undefined (found in field deviceId)` al guardar sesiones. Ahora se filtran todos los valores `undefined` antes de escribir a Firestore (misma técnica usada en `saveGatesTemplate`).
- **Errores visibles al guardar**: El botón "Guardar Sesión" ahora muestra el error en la UI en vez de silenciarlo.

#### Añadido
- **Campos `shiftId` y `sessionDate`**: La sesión ahora persiste el turno y la fecha de producción (derivada de los datos) como campos de primer nivel, facilitando clasificación y búsqueda.
- **Sesiones agrupadas por día**: La lista de sesiones guardadas agrupa automáticamente por fecha de producción con resumen de piezas totales y P0% promedio por día.
- **Turnos visibles**: Cada sesión muestra su turno asignado y rango horario (HH:MM — HH:MM).
- **Días colapsables**: Click en el encabezado de cada día para expandir/colapsar sus sesiones.

## [2.47.1] - 2026-02-09

### 🤖 IA Real (Groq) para Análisis Grader

#### Añadido
- **GroqAIProvider**: Integración real con Groq API (Llama 3.3 70B) para diagnóstico de grader. Reemplaza el provider mock anterior.
  - Sistema de prompt profesional como analista de datos estadístico de máquinas clasificadoras de salmón.
  - Envía KPIs, distribuciones, balance de gates, estadísticas, sugerencias de swap, análisis de lotes, matriz y series temporales.
  - Respuesta JSON estructurada con resumen ejecutivo, hallazgos, causa raíz y plan de acción.
  - Fallback automático a MockAIProvider si Groq no está disponible (con advertencia en consola).
- **Algoritmo de swaps v2**: 3 categorías de sugerencias (CORRECCIÓN, OPTIMIZACIÓN, INVESTIGACIÓN) usando asignación ideal por método de Largest Remainder.
  - `allocationScore`: Nuevo KPI que mide cuán cerca está la distribución real del ideal.
  - `idealGates` y `gap` en cada gate balance insight.
- **Pestaña "Diagnóstico"**: Renombrada desde "Insights" con secciones en español:
  - "Alertas Automáticas": Alertas generadas por reglas estadísticas (13 reglas determinísticas).
  - "Diagnóstico IA (Groq)": Análisis profundo con IA — causas raíz, correlaciones y plan de acción.
- **Tooltips enriquecidos**: Descripciones detalladas con ejemplos para alertas automáticas y diagnóstico IA.

#### Correcciones
- **Swap suggestions lógicas**: Corregido algoritmo que sugería swaps contraproducentes (mover gates de rango con alta demanda a baja demanda).

## [2.42.0] - 2026-02-08

### 🚀 Nuevas Funcionalidades

#### Módulo Visor 3D
- **Nuevo módulo completo "Visor 3D"** en el sidebar con icono Box
- **Upload de modelos 3D**: Drag & drop con validación de formato (GLB/GLTF/OBJ/FBX) y tamaño (máx 200MB), barra de progreso
- **Visor 3D interactivo**: Three.js + React Three Fiber con OrbitControls (orbit/zoom/pan), iluminación por entorno, grid, reset de vista, fullscreen
- **Sistema de cotas/dimensiones**: Admin crea cotas seleccionando 2 puntos en el modelo, se renderizan como líneas + etiquetas con medidas (mm/cm/m configurable)
- **QR y link directo**: Cada modelo tiene URL estable `/visor-3d/:modelId`, generación de QR, botón copiar link
- **Gestión de modelos**: Listado con búsqueda, card por modelo con acciones (abrir/link/QR/eliminar)
- **Firebase Storage**: Almacenamiento en `models3d/{modelId}/{filename}`
- **Firestore**: Colección `models3d` con metadatos + subcolección `dimensions` para cotas
- **Reglas de seguridad**: Lectura para autenticados, escritura/borrado solo admin
- **Code splitting**: Three.js en chunk separado para no afectar carga inicial

### 🔧 Mejoras Técnicas
- Chunk separado para Three.js (~1MB) optimizando carga de la app
- Error handling en snapshot listeners de Firestore
- `.firebaserc` agregado para deploy directo desde Codespace

---

## [2.48.0] - 2026-02-02

### 🚀 Nuevas Funcionalidades

#### Formato de Checklist para Inspecciones
- **Adaptación a formato Excel de inspección diaria**: El sistema ahora soporta el formato completo de checklist de inspección basado en el Excel compartido.
  - **Encabezado de inspección**: Campos adicionales para Hora Inicio, Hora Término y Folio N°.
  - **Checklist por punto**: Cada punto de inspección ahora incluye:
    - Checkbox "Cumple (C)" y "No Cumple (N/C)" mutuamente excluyentes.
    - Campo de "Observación" para notas detalladas.
    - "Fecha de Reparación" (se muestra cuando se marca No Cumple).
    - "Hora Inicio" y "Hora Término" para cada punto.
  - **Exportación PDF mejorada**: El PDF generado ahora incluye tabla con formato de checklist:
    - Columnas: #, Actividad, C, N/C, Observación, F. Reparación, Fotos.
    - Encabezado con horarios y folio.
  - **Soporte de imágenes**: Mantiene capacidad de adjuntar hasta 5 fotos por punto con descripciones.

### 🔧 Mejoras Técnicas
- Actualizado tipo `Inspection` para incluir `horaInicio`, `horaTermino`, `folio`.
- Actualizado tipo `InspectionItem` con campos de checklist: `cumple`, `noCumple`, `observacion`, `fechaReparacion`, `horaInicioItem`, `horaTerminoItem`.
- Actualizados parsers de Firestore para soportar nuevos campos.
- Modal de edición de punto expandido con sección de checklist.

## [2.47.0] - 2026-02-09

### ✨ Nuevas Funcionalidades

#### Gestión de Inspecciones
- **Duplicar Inspección**: Nueva funcionalidad para copiar rutas de inspección existentes.
  - Permite reutilizar rutas configuradas anteriormente.
  - Genera una copia limpia de los puntos de inspección (sin fotos ni estados completados).
  - Incluye opción para personalizar el nombre de la nueva inspección.
  - Mantiene la asignación del mapa original.

#### Análisis Grader
- **Upload simplificado**: Solo archivos Pieza-Pieza necesarios, eliminado checklist de otros tipos de Excel.
- **Multi-upload por turno**: Agregar varios archivos pieza-pieza durante el día; detección automática del rango de turno (hora inicio-fin, duración, piezas totales).
- **Rangos de peso editables**: Nueva sección colapsable en Config. Gates para personalizar min/max gramos por cada calibre (0-2lb, 2-4lb, etc).
- **Drill-down Punto Cero**: Click en cualquier fila de causa en tabla P0 para expandir y ver registros individuales pieza-pieza (hora, error, peso, calidad, calibre, lote).
- **Todas las causas P0 visibles**: Las 6 categorías siempre aparecen incluyendo "No leído por fotocélula" (0 piezas si no hay datos).

### 🔧 Correcciones

#### Firebase
- **Firestore Rules**: Eliminada validación `isValidDocSize()` (usaba `request.resource.size()` no válido en Firestore) de reglas de `graderGatesTemplates` y `graderAnalysisSessions`. Las plantillas ahora se pueden guardar correctamente.

#### Técnico
- **Custom Weight Ranges**: Motor de análisis parametrizado para usar rangos de peso personalizados cuando están configurados.

## [2.46.1] - 2026-02-01

### 🐛 Bug Fixes

#### Técnico
- **Version Check**: Corregido error `ERR_SSL_PROTOCOL_ERROR` en console log durante el polling de versión.
  - Validación de URL antes de fetch.
  - Verificación estricta de `content-type: application/json` para evitar parsear HTML de páginas 404 como JSON.
  - Cambio de parámetro `t` a `v` para evitar conflictos de caché.

## [2.46.0] - 2026-02-01

### 🗺️ Rutas de Inspección: Carga masiva y mejoras

#### Añadido
- **Carga masiva por lista**: Nuevo campo de texto al crear inspección para pegar listas de puntos (Excel/Notepad).
- **Parseo inteligente**: Detecta y limpia numeración automática (1., -, *) al crear puntos desde lista.
- **Campo Inspectores**: Nuevo campo "Inspectores" (opcional) para registrar nombres de quienes realizan la ruta.
- **Edición**: Posibilidad de editar el campo de inspectores en rutas existentes.

#### Mejorado
- **PDF Export**: El reporte PDF ahora muestra los nombres de los inspectores en la cabecera si están disponibles.
- **Tipos**: Actualizada interfaz `Inspection` con `inspectorNames`.

## [2.6.1] - 2026-01-10

### 🎯 UX Mejorada: Filtros y Persistencia

#### Añadido
- **Filtro automático**: Equipos seleccionados en jerarquía se filtran al navegar a módulo equipos
- **Badge informativo**: Indicador visual con cantidad de equipos filtrados y botón "Ver todos"
- **Persistencia de expansión**: Nodos expandidos en jerarquía persisten al salir y volver
- **Persistencia de equipos**: Lista expandible de equipos por nodo también mantiene estado
- **Query params**: Soporte para `?selected=id1,id2` y `?id=equipmentId` en URL

#### Técnico
- Estado de expansión guardado en `localStorage` con keys:
  - `hierarchy_expanded_nodes`: nodos de jerarquía expandidos
  - `hierarchy_expanded_equipment_nodes`: listas de equipos expandidas
- Filtro `filterSelectedIds` en EquipmentPage con efecto desde query params
- Restauración automática de estados al montar componentes

#### Mejorado
- UX de navegación entre módulos más fluida
- No se pierde contexto visual al cambiar entre páginas
- Botón "Colapsar todo" sigue funcionando para limpiar expansión manualmente

## [2.6.0] - 2026-01-10

### 🏢 Sistema de Estructura Base y Expansiones

#### Añadido
- **Distintivos visuales**: Badge azul "Base" con icono Clock para estructura original
- **Badge expansiones**: Badge verde "Nuevo" con icono Sparkles para nodos agregados
- **Tooltips informativos**: Fechas de creación visibles al pasar sobre badges
- **Auditoría temporal**: Seguimiento visual del crecimiento organizacional
- **Script de migración**: `mark_base_hierarchy.js` para marcar estructura base
- **Auto-clasificación**: Nuevos nodos marcados automáticamente como expansiones

#### Base de Datos
- Campo `isBaseStructure?: boolean` en HierarchyNode (true=base, false=expansión)
- Campo `baseStructureDate?: Timestamp` para fecha común de estructura base
- Migración completada: 862 nodos marcados como estructura base

#### Técnico
- Actualizado `apps/pwa/src/types/hierarchy.ts` con nuevos campos
- Modificado `HierarchyPage.tsx` para mostrar badges según clasificación
- Actualizado `useHierarchy.ts` para marcar nuevos nodos como expansiones
- Documentación completa en `docs/development/BASE_EXPANSION_SYSTEM.md`

## [2.2.31] - 2026-01-09

### 🧰 Equipos: sincronización desde Jerarquía

#### Añadido
- Sync: script admin para poblar/actualizar `/equipment` desde `/hierarchy` (nivel >= 5 con código)
- Equipos: muestra `hierarchyPath` y permite buscar también por ruta
- Navegación: botón “Ver jerarquía” (deep-link a Jerarquía con `q` + `focus`)

#### Mejorado
- Equipos: edición de campos operativos (estado/criticidad + metadata) sin depender de zonas

#### Seguridad/Control
- Equipos: `syncExcluded` + eliminación lógica (`deleted`) para evitar recreación automática

## [2.2.30] - 2026-01-09

### 👤 Usuarios: Rol `usuario` (no admin)

#### Añadido
- Roles: soporte end-to-end de rol `usuario` (tipos/validación/UI)
- Settings (admin): panel para crear perfil Firestore usando un UID ya existente

#### Seguridad
- Frontend: rutas admin protegidas (configuración/jerarquías)
- Firestore Rules: endurecimiento de `/users` para evitar escalamiento (create/update)

### 🌲 Jerarquía: Buscador mejorado

#### Mejorado
- Búsqueda: soporte de múltiples términos (AND)
- Conteo: resultados cuentan solo coincidencias reales

## [2.2.29] - 2026-01-09

### 🌲 Jerarquía: Conteo de hijos (Admin)

#### Mejorado
- Árbol: muestra conteo de hijos por nodo en cada nivel

## [2.2.28] - 2026-01-09

### 🚀 Release para pruebas en Pages

#### Añadido
- Deploy: flujo GitHub Pages listo para validar en entorno Pages

#### Corregido
- Versionado: fecha/version sincronizadas para la release

## [2.2.27] - 2026-01-09

### 🌲 Jerarquía Extendida (695 nodos)

#### Añadido
- Datos: mandante extendido a 695 nodos (incluye subárbol Planta YAL)

#### Mejorado
- Herramientas: soporte para merge MD → dataset extendido e importación/reconciliación consistente

## [2.2.26] - 2026-01-09

### 🌲 Jerarquía Optimizada (Admin + Cache)

#### Añadido
- Admin: control de estado `activo` desde el diálogo de edición
- Admin: visualización de nodos inactivos en el árbol

#### Mejorado
- Selector: breadcrumb muestra nombres reales del path
- Performance: cache TTL (~5 min) para tree/children/path e invalidación en mutaciones

#### Corregido
- Admin: eliminación segura en cascada cuando hay descendientes (evita nodos huérfanos)

## [2.2.25] - 2026-01-09

### 🧩 Metadatos por par + Exportación agrupada

#### Añadido
- Título por par (opcional)
- Ubicación por par desde jerarquía o manual
- Sugerencias de títulos/ubicaciones existentes para reutilizar

#### Mejorado
- PDF: páginas ordenadas/agrupadas por título + ubicación del par

## [2.2.24] - 2026-01-09

### 📷 Evidencias Fotográficas (multi-foto por par)

#### Añadido
- Soporte de múltiples fotos ANTES y DESPUÉS por cada par (manteniendo compatibilidad con el modelo legado)
- Selección de foto dentro del par para comparar y anotar

#### Mejorado
- Exportación PDF en formato “Informe Técnico”: 1 par por página y páginas adicionales cuando hay múltiples fotos por par
- Listados: conteos y miniaturas calculadas desde `pairPhotos` cuando existe

#### Corregido
- Validaciones de exportación actualizadas para no bloquear evidencias multi-foto

## [2.1.7] - 2025-12-29

### 🧩 Reconciliación Mandante y Estabilidad de Jerarquía

#### 🗂️ Datos (Mandante)
- Dataset canónico `jerarquia/EXPECTED_CANONICAL.json` (438 códigos únicos) y reporte `jerarquia/EXPECTED_CONFLICTS.json`
- Verificación y reconciliación Firestore ↔ mandante

#### 🛡️ Integridad en la App
- Bloqueo de creación/actualización de nodos activos con `codigo` duplicado
- Soporte de refresco/detección de cambios para evitar jerarquía stale

#### 🧰 Herramientas y repo
- Scripts de apoyo en `jerarquia/` para verificación/reconciliación
- `.venv` agregado a `.gitignore` y task de VS Code para build del PWA

## [1.0.4] - 2025-12-24

### 🔧 Corrección Completa de Mapa

#### Eventos Wheel (Zoom con Mouse)
- **Fix definitivo**: addEventListener con `passive: false` en lugar de onWheel
- Eliminado 100% los errores "Unable to preventDefault inside passive event listener"
- Zoom suave con rueda del mouse sin warnings en consola
- useEffect para manejar eventos wheel con control total

#### Resolución de Imágenes
- Agregado `key={mapUrl}` para forzar re-render cuando cambia el mapa
- `imageRendering: 'crisp-edges'` para máxima nitidez
- `objectFit: 'contain'` con maxWidth/maxHeight none
- `decoding: 'sync'` para carga síncrona
- Logging de carga con dimensiones naturales de imagen

#### Vista del Mapa
- Reset automático de zoom/posición al cambiar entre modo vista/editor
- Fix: Mapa visible inmediatamente después de "Volver a Vista"
- Sin necesidad de hacer zoom para ver el mapa
- useEffect que resetea escala a 1 y posición a (0,0)

#### Interfaz de Zonas
- Eliminados iconos de AlertTriangle en badges de zonas
- Simplificado label de zonas: solo código/nombre
- Tipografía mejorada: font-semibold en labels
- Badge de conteo con fondo amarillo (#fbbf24) más visible
- Bordes reducidos de border-3 a border-2
- Divs en lugar de Badge components para mejor control

#### 📊 Bundle
- Bundle: 1067.26 KiB (MapPage: 34.61KB)
- Build time: 9.35s
- 0 errores TypeScript
- 0 warnings

---

## [1.0.3] - 2024-12-24

### 🗺️ Optimización de Mapas y PWA

#### Corregido
- **Fix de preventDefault en eventos touch**
  - Agregado `touchAction: 'none'` al contenedor del mapa
  - Eliminados warnings de "Unable to preventDefault inside passive event listener"
  - Mejor experiencia de zoom y pan en dispositivos móviles

#### Mejorado
- **Calidad de imágenes de mapas**
  - Las imágenes de mapas mantienen resolución original
  - Sin compresión automática para planos de planta
  - Agregado `imageRendering: 'high-quality'` y `crisp-edges`
  - Metadata mejorada en uploads (nombre original, fecha)
  - Loading eager para carga prioritaria

- **Sistema de versionado**
  - Versión visible en login y sidebar
  - Actualizado a v1.0.3
  - Sistema centralizado en constantes

#### Técnico
- Metadata customizada en uploads de mapas
- Mejoras en renderizado de imágenes con CSS
- Loading y decoding optimizados

---

## [1.0.2] - 2024-12-24

### ⚡ Optimizaciones de Rendimiento

#### Mejorado
- **Debounce en búsquedas (300ms)**
  - IncidentsPage: Búsqueda optimizada con debounce para reducir re-renders
  - PreventivePage: Agregado input de búsqueda con debounce por título/descripción
  - Menor consumo de CPU y mejor experiencia de usuario en búsquedas

- **Code Splitting con React.lazy()**
  - MapPage: Carga diferida (~34 KB / 10 KB gzip)
  - PreventivePage: Carga diferida (~26 KB / 7 KB gzip)
  - SettingsPage: Carga diferida (~13 KB / 4 KB gzip)
  - **Total optimizado**: ~73 KB que solo se cargan cuando el usuario visita estas páginas
  - Suspense con LoadingScreen para mejor UX durante carga

- **Utilidades mejoradas**
  - Agregada función `debounce` genérica en `@/lib/utils`
  - Tipado TypeScript completo
  - Documentación JSDoc incluida

#### Añadido
- **Sistema de versionado visible**
  - Label de versión en sidebar de la aplicación
  - Archivo de constantes `@/constants/version.ts` para gestión centralizada
  - Comentario de versión en firestore.rules
  - Sincronización automática con package.json

#### Técnico
- Imports directos en lazy loading para evitar tree-shaking issues
- Chunks separados por ruta para máxima eficiencia
- Build optimizado: 20 entries en precache
- Reducción significativa en bundle inicial

---

## [1.0.1] - 2024-12-24

### 🚀 Mejoras de Mapas y Visualización

#### Mejorado
- **Optimización de zoom del mapa**
  - Rango extendido: 0.5x a 10x (antes 0.3x a 5x)
  - Zoom más suave y preciso (factor 1.1 vs 1.15)
  - Mejor experiencia para ver detalles finos
  
- **Marcadores de incidencias mejorados**
  - Marcadores más grandes y visibles (32px vs 24px)
  - Borde más grueso (3px) para mejor contraste
  - Efecto hover mejorado: escala 1.5x con sombra
  - Tooltips informativos al pasar el mouse
  - Ring de selección más prominente
  - Mejor accesibilidad con aria-labels
  
- **Zonas más visibles**
  - Colores con mayor opacidad (40% vs 30%)
  - Mejor contraste de fondo (15% vs 5%)
  - Efectos hover más claros
  - Bordes más gruesos (3px vs 2px)
  - Sombras en hover para profundidad
  
#### Técnico
- Basado en mejores prácticas de Leaflet y MapBox
- Investigación en repos: react-leaflet, mapbox-gl-js, Leaflet
- Optimizado para alta densidad de marcadores
- Preparado para clustering futuro

---

## [1.0.0] - 2024-12-24

### 🎉 LANZAMIENTO INICIAL

Primera versión estable de producción del Sistema de Levantamiento de Incidencias en Planta.

### ✅ Añadido

#### Core Features
- **Sistema de autenticación** con Firebase Auth
  - Login y registro de usuarios
  - Gestión de roles (admin, supervisor, técnico)
  - Códigos de invitación
  
- **Gestión de Incidencias**
  - Crear, editar, eliminar incidencias
  - Estados: pendiente, confirmada, rechazada, en proceso, cerrada
  - Prioridades: crítica, alta, media, baja
  - Tipos: correctivo, preventivo, predictivo, proactivo
  - Adjuntar hasta 10 fotos por incidencia
  - Registrar hasta 20 síntomas
  - Compresión automática de imágenes >1MB
  
- **Gestión de Equipos**
  - CRUD completo de equipos
  - Búsqueda con debounce (300ms)
  - Criticidad: alta, media, baja
  - Estados: operativo, en mantenimiento, fuera de servicio
  - Asociación a zonas
  
- **Mantenimiento Preventivo**
  - Creación de tareas preventivas
  - Programación: diaria, semanal, mensual, anual
  - Checklist de verificación
  - Ejecución de tareas
  - Historial de ejecuciones
  - Dashboard con estadísticas
  
- **Editor de Mapas/Zonas**
  - Editor de polígonos para crear zonas
  - Niveles de zonas (1, 2, 3)
  - Tipos de zona: producción, almacén, oficinas, mantenimiento, etc.
  - Visualización en mapa interactivo
  - Upload de mapas custom
  
- **Configuración**
  - Gestión de usuarios (activar/desactivar)
  - Cambio de roles
  - Generación de códigos de invitación
  - Configuración general del sistema
  - Preferencias de notificaciones

#### Validación y Seguridad
- **Sistema de validación con Zod** (8 schemas)
  - `loginSchema` - Validación de login
  - `signUpSchema` - Validación de registro
  - `createIncidentSchema` - Validación de incidencias
  - `createEquipmentSchema` / `updateEquipmentSchema` - Validación de equipos
  - `createZoneSchema` - Validación de zonas
  - `createPreventiveTaskSchema` / `executePreventiveTaskSchema` - Tareas preventivas
  - `validateFile` - Validación de archivos (max 5MB, solo imágenes)
  
- **Firestore Security Rules**
  - Validación a nivel servidor
  - Restricciones por rol
  - Límites de tamaño de campos
  - Protección contra modificaciones no autorizadas

#### Performance y Optimización
- **Rate Limiting**
  - Debounce en búsqueda de equipos (300ms delay)
  - Throttle utilities disponibles
  - RateLimiter class
  - Cooldown class
  - ActionQueue class
  
- **Compresión de imágenes**
  - Auto-compresión de fotos >1MB
  - Mantiene calidad aceptable
  - Reduce tiempos de subida y costos de storage

#### Logging y Monitoreo
- **Sistema de logging centralizado**
  - `logger.info()` - Operaciones exitosas
  - `logger.warn()` - Advertencias
  - `logger.error()` - Errores con stack trace completo
  - `logger.debug()` - Debugging
  - Contexto adicional en cada log (userId, action, etc.)
  - 26 console.error migrados a logger estructurado
  
#### UI/UX
- **Diseño responsive** con Tailwind CSS
- **Componentes de Radix UI**
  - Dialogs, Dropdowns, Tabs, Select, etc.
  - Accesibilidad integrada
- **Iconos de Lucide React**
- **Tema claro/oscuro** (preparado)
- **Loading states** en todas las operaciones
- **Mensajes de error descriptivos** en formularios

#### PWA Features
- **Service Worker** con Workbox
- **Manifest.json** configurado
- **Cacheo de assets**
- **Funcionamiento offline** (básico)
- **Installable** en dispositivos móviles

### 🔧 Técnico

#### Stack Tecnológico
- React 18.3.1 con TypeScript 5.7.2
- Vite 6.4.1 (build tool)
- Firebase 11.1.0 (Backend)
  - Firestore (base de datos)
  - Storage (archivos)
  - Auth (autenticación)
- Zustand 5.0.2 (state management)
- React Router 7.1.1 (routing)
- Zod 4.2.1 (validación)
- date-fns 4.1.0 (fechas)
- Tailwind CSS 3.4.17 (estilos)
- Radix UI (componentes)

#### Build Stats
```
✓ Build time: 9.30s
✓ TypeScript errors: 0
✓ Bundle size: 1,055.70 KiB
  - firebase.js: 516.35 KB
  - index.js: 263.77 KB
  - vendor.js: 178.41 KB
  - ui.js: 83.78 KB
✓ Modules: 1,816 transformados
```

#### Estructura del Proyecto
```
apps/pwa/
├── src/
│   ├── components/     # Componentes reutilizables
│   │   ├── layout/     # Layout principal
│   │   ├── map/        # Editores de mapas
│   │   └── ui/         # UI components
│   ├── lib/            # Utilidades
│   │   ├── firebase.ts     # Config Firebase
│   │   ├── logger.ts       # Sistema logging
│   │   ├── rate-limit.ts   # Rate limiting
│   │   └── validation.ts   # Schemas Zod
│   ├── pages/          # Páginas de la app
│   ├── services/       # Servicios Firebase
│   ├── store/          # Zustand stores
│   └── types/          # TypeScript types
├── firestore.rules     # Reglas de seguridad
└── package.json
```

### 📚 Documentación

#### Archivos Creados
- `README.md` - Documentación general
- `MEJORAS_IMPLEMENTADAS_FINAL.md` - Detalle de mejoras
- `CODE_SPLITTING_GUIDE.md` - Guía de optimización
- `RESUMEN_FINAL.md` - Resumen ejecutivo
- `CHANGELOG.md` - Este archivo

### 🐛 Corregido

#### TypeScript Errors (10 total)
- ✅ Error en App.tsx: logger no importado
- ✅ Error en validation.ts: tipo PropertyKey incompatible
- ✅ Error en rate-limit.ts: tipo genérico incorrecto en ActionQueue
- ✅ Error en LoginPage.tsx: PropertyKey en 2 ubicaciones
- ✅ Error en EquipmentPage.tsx: PropertyKey
- ✅ Error en SettingsPage.tsx: variable inviteRole → newInviteRole (2 ubicaciones)
- ✅ Error en PreventivePage.tsx: import no usado (debounce)
- ✅ Error en PreventivePage.tsx: propiedad equipoId → equipmentId

#### Build Warnings
- Bundle >500KB warning (normal para PWA, se optimizará con code splitting)

### 🔒 Seguridad

#### Validación Doble Capa
- Cliente (Zod): Feedback inmediato, mejor UX
- Servidor (Firestore Rules): Seguridad real, integridad de datos

#### Credenciales
- `.env` para variables de entorno
- `.gitignore` actualizado
- Firebase config seguro

### 📊 Métricas

#### Cobertura de Validación
- ✅ LoginPage: 100%
- ✅ EquipmentPage: 100%
- ✅ IncidentForm: 100%
- ⏳ PreventivePage: 0% (pendiente)
- ⏳ SettingsPage: 0% (pendiente)
- ⏳ ZoneEditor: 0% (pendiente)

#### Logging Coverage
- ✅ 100% - Todos los console.error migrados a logger (26/26)

#### Performance
- ✅ Búsquedas optimizadas con debounce
- ✅ Compresión de imágenes automática
- ⏳ Code splitting pendiente (-300KB estimado)

---

## [Sin liberar]

### 🎯 Planeado para v1.1.0

#### Performance
- [ ] Implementar code splitting con React.lazy()
  - Lazy load de MapPage (~100KB)
  - Lazy load de PreventivePage (~80KB)
  - Lazy load de SettingsPage (~60KB)
  - Suspense con loading states
  - Reducción estimada: -300KB total

#### Validación
- [ ] Completar validación en todos los formularios
  - PreventivePage (2 formularios)
  - SettingsPage (múltiples forms)
  - ZoneEditor
  - PolygonZoneEditor

#### Rate Limiting
- [ ] Agregar debounce a búsquedas restantes
  - IncidentsPage
  - PreventivePage

#### Testing
- [ ] Tests unitarios con Vitest
  - Tests de schemas Zod
  - Tests de utilidades (debounce, throttle)
  - Tests de flujos críticos

#### Features
- [ ] Modo offline avanzado
- [ ] Sincronización en background
- [ ] Push notifications
- [ ] Analytics integrado

### 🎯 Planeado para v1.2.0

#### Monitoring
- [ ] Integración con Sentry
- [ ] Métricas de performance real
- [ ] Alertas automáticas

#### Optimización
- [ ] Service Worker optimizado
- [ ] Prefetching inteligente
- [ ] Image lazy loading
- [ ] Bundle <800KB

#### Features
- [ ] Dashboard avanzado con gráficos
- [ ] Exportación de reportes (PDF, Excel)
- [ ] Sistema de notificaciones in-app
- [ ] Historial de cambios (audit log)

---

## 📝 Convenciones de Versionado

Este proyecto usa [Semantic Versioning](https://semver.org/lang/es/):

- **MAJOR** (X.0.0): Cambios incompatibles con versiones anteriores
- **MINOR** (x.Y.0): Nueva funcionalidad compatible con versiones anteriores
- **PATCH** (x.y.Z): Corrección de errores compatible con versiones anteriores

### Tipos de Cambios

- **Añadido**: Nueva funcionalidad
- **Cambiado**: Cambios en funcionalidad existente
- **Obsoleto**: Funcionalidad que será removida en futuras versiones
- **Eliminado**: Funcionalidad removida
- **Corregido**: Corrección de bugs
- **Seguridad**: Correcciones de seguridad

---

## 🔗 Enlaces

- [Repositorio](https://github.com/tu-repo/mantenimiento-pwa) (actualizar)
- [Documentación](./README.md)
- [Guía de Optimización](./CODE_SPLITTING_GUIDE.md)
- [Issues](https://github.com/tu-repo/mantenimiento-pwa/issues) (actualizar)

---

**Última actualización**: 24 de diciembre de 2024  
**Versión actual**: 1.0.0  
**Estado**: ✅ PRODUCCIÓN READY
