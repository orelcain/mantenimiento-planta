# 🚀 Sistema de Versionado - Mantenimiento PWA

## Versión Actual: **v2.47.22**

**Fecha de lanzamiento**: 11 de febrero de 2026  \
**Estado**: 🚀 PRODUCTION READY  \
**Build**: ✅ Stable

---

## 📋 Información de la Versión

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