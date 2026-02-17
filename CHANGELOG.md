# 📋 CHANGELOG - Sistema de Mantenimiento PWA

Todas las mejoras notables de este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [2.48.31] - 2026-02-17

### 🎯 Consistencia de estado online en Sensores IoT

#### Fixes
- **KPI Online corregido**: el contador superior en `Sensores IoT` ahora usa frescura real (`lastSeen + sendInterval`) y deja de contar equipos stale como conectados.
- **Card WiFi coherente**: el bloque `WiFi Principal` muestra `Conectado` solo cuando el dispositivo está fresco; si no, cambia a `Configurada`.
- **Estado explícito en WiFi**: se agrega línea de estado (`En línea` / `Sin datos recientes`) para evitar ambigüedad operativa.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.30] - 2026-02-17

### 🧭 Fix de estado online en pestaña Sensores

#### Fixes
- **Estado operativo consistente**: la pestaña `Sensores` ahora considera frescura real (`lastSeen + sendInterval`) para mostrar estado del dispositivo, evitando falsos `Online` cuando no hay reportes recientes.
- **Indicadores unificados**: lista de dispositivos, bloque de telemetría y sección de emparejar usan la misma evaluación de frescura.
- **Actualización visual periódica**: el estado se recalcula automáticamente cada pocos segundos para reflejar cambios sin recargar la página.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.29] - 2026-02-17

### 🔄 Fix de actualización en tiempo real del gráfico de sensores

#### Fixes
- **Seguimiento en vivo corregido**: la gráfica vuelve a mostrar por defecto las lecturas más recientes conforme llegan desde RTDB según el intervalo configurado del sensor.
- **Ventana histórica sin bloquear el vivo**: el zoom/pan horizontal solo fija la ventana cuando el usuario interactúa; al volver al rango total, la vista retoma el modo automático en tiempo real.
- **Indicador de estado de vista**: se distingue entre modo `auto` y modo de navegación histórica para evitar confusión operativa.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.28] - 2026-02-17

### 🔎 Zoom horizontal en gráfico del panel sensores

#### Mejoras
- **Zoom temporal con rueda del mouse**: el gráfico por dispositivo ahora permite ampliar o reducir la ventana horizontal de muestras con scroll.
- **Desplazamiento lateral con `Shift + rueda`**: se puede navegar el histórico visible sin salir del panel.
- **Indicador de ventana activa**: muestra cuántas muestras están visibles vs el total para lectura operativa rápida.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.27] - 2026-02-17

### 📊 Gráfico de sensores interactivo en panel técnico

#### Mejoras
- **Hover sobre la curva con dato temporal**: el gráfico por dispositivo ahora permite mover el mouse y ver el punto seleccionado con fecha/hora, temperatura y humedad registradas.
- **Referencia al intervalo configurado**: se muestra el `sendInterval` del dispositivo y una estimación de próxima actualización basada en la última lectura recibida.
- **Seguimiento visual del punto activo**: se agrega guía vertical y marcadores para facilitar lectura operativa del registro en el tiempo.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.26] - 2026-02-17

### 🧯 Fix final de errores 404 en consola (modulepreload)

#### Fixes
- **Modulepreload desactivado en build**: se eliminan solicitudes automáticas `modulepreload` que podían quedar desfasadas por caché en GitHub Pages y disparar `404` en líneas 34–36 del `index`.
- **Carga principal más robusta**: la app mantiene carga por `index.js` sin ruido de errores de pre-carga obsoleta en consola.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.25] - 2026-02-17

### 🛠️ Fix de errores 404 en PWA desplegada

#### Fixes
- **Assets de build con nombres estables**: se configuró Vite para emitir `entry/chunk/assets` sin hash cambiante, reduciendo errores `404` cuando el navegador conserva un `index.html` de una versión anterior.
- **Mayor robustez en GitHub Pages**: se evita el desacople temporal entre HTML cacheado y bundles publicados que causaba `net::ERR_ABORTED 404` en consola.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.24] - 2026-02-17

### 📈 Gráfico de cambios del sensor en panel técnico

#### Mejoras
- **Tendencia por dispositivo en el panel**: cada tarjeta en `sensors/monitor` ahora incluye un gráfico compacto con la evolución reciente de temperatura y humedad.
- **Lecturas en tiempo real desde RTDB**: el gráfico se alimenta con las últimas muestras por equipo asignado para visualizar variaciones sin abrir la vista de detalle.
- **Fallback operativo claro**: cuando no hay histórico suficiente, el panel informa explícitamente que no hay datos para graficar.

#### Calidad
- **Versionado sincronizado del release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `manifest.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.23] - 2026-02-16

### 🔧 Estabilización ESP32 en producción + OTA remota + guías operativas

#### Mejoras
- **ESP32 estabilizado sin USB**: se ajustó el firmware para evitar reinicios por memoria al iniciar streams opcionales de RTDB y mantener captura continua de temperatura/humedad.
- **OTA remota tipo pull habilitada**: el dispositivo puede consultar manifiesto publicado y actualizar firmware sin depender de estar en la misma red WiFi que el PC.
- **Particiones preparadas para OTA grande**: se agregó tabla de particiones personalizada para soportar firmware con funciones avanzadas de actualización.

#### Documentación
- **Guía completa de alta manual de nuevos ESP32**: procedimiento paso a paso para primera carga USB desde cualquier PC y operación posterior por OTA.
- **Guía de prueba rápida LOGO**: flujo mínimo para validar conectividad y visualización en PWA con contrato RTDB vigente.

#### Calidad
- **Validación operativa end-to-end**: verificado en campo que el ESP32 publica `lastSeen`, `temperatura` y `humedad` en RTDB sin conexión USB al PC.
- **Sincronización de versión release**: actualización coordinada de `package.json`, constantes de versión, `version.json`, `CHANGELOG.md` y `VERSION.md`.

## [2.48.22] - 2026-02-16

### 📟 Panel técnico de sensores + cierre de sincronización de release

#### Mejoras
- **Nuevo panel operativo rápido de sensores**: se agrega la vista `sensors/monitor` orientada a técnicos con KPIs de estado, alertas y acceso directo a incidencias.
- **Acceso ágil desde navegación**: el panel técnico quedó disponible tanto en menú lateral como desde botón directo en `Sensores IoT`.
- **Optimización móvil**: se incorpora CTA sticky en móvil (`Panel técnico`) para acceso inmediato durante el recorrido de monitoreo.
- **Contrato LOGO→RTDB formalizado**: documentación técnica publicada para integrar Siemens LOGO con el esquema RTDB ya consumido por la PWA.

#### Calidad
- **Versionado sincronizado**: release alineado en `apps/pwa/package.json`, `src/constants/version.ts`, `public/version.json`, `CHANGELOG.md` y `VERSION.md`.
- **Verificación VS Code Problems**: sin errores activos detectados en el workspace tras los cambios.

## [2.48.21] - 2026-02-16

### 🚀 Estabilidad de deploy Pages + compactación visual del timeline

#### Fixes
- **Deploy GitHub Pages sin cancelaciones cruzadas**: se ajustó la concurrencia del workflow para evitar auto-cancelación de ejecuciones en progreso.
- **Polling acotado en `deploy-pages`**: se incorporaron timeout interno, límite de errores y reintento controlado para evitar bucles largos en estado pending.
- **Fallo explícito y trazable**: si ambos intentos de publicación fallan, el workflow termina con error claro en lugar de quedar indefinidamente consultando estado.

#### Mejoras
- **Timeline más compacto en cabecera**: selector de proyecto, KPIs y bloque de controles superiores reducen altura para maximizar área útil del diagrama.
- **Controles densificados sin perder funcionalidad**: inputs/selects/badges y espaciados fueron ajustados para mejorar lectura y operación en pantallas medianas.

## [2.48.20] - 2026-02-15

### 🧭 Corrección de zoom y alineación en timeline Gantt

#### Fixes
- **Zoom perceptible en rangos cortos**: `Día / Semana / Mes` ahora ajusta anchos mínimos distintos por escala para que las barras cambien visualmente.
- **Alineación fila-barra estable**: sincronizado el scroll vertical entre la tabla izquierda y el panel de barras del timeline.
- **Desfase de encabezados corregido**: altura de cabecera unificada para que tarea y barra queden en la misma línea.

## [2.48.19] - 2026-02-15

### 🔍 Visor seguro de evidencia en Gantt

#### Mejoras
- **Sin salida a URL pública**: las fotos de comentarios ya no abren `target=_blank` a Firebase Storage.
- **Visor interno ampliado**: click en miniatura abre modal en la misma app.
- **Zoom y pan**: controles de `acercar`, `alejar`, `restablecer`, además de paneo por arrastre y doble click para toggle.
- **Cobertura completa**: aplica tanto en modal rápido de timeline como en historial de la pestaña `Tareas`.

## [2.48.18] - 2026-02-15

### 🧯 Hotfix deploy y limpieza de errores en VS Code

#### Fixes
- **Type-check estable en CI**: corregido acceso tipado de día de semana en `GanttPlannerPage` para evitar `Type 'undefined' cannot be used as an index type`.
- **Build de Gantt restaurado**: re-agregado `orderBy` en imports de `gantt.ts` para compilar consultas de tareas correctamente.
- **Paridad local/Actions**: errores reportados en VS Code Problems ahora quedan alineados con pipeline de GitHub Pages.

## [2.48.17] - 2026-02-16

### 🧾 Notas históricas editables + estabilidad IA/comentarios

#### Mejoras
- **Notas multilinea reales**: los comentarios de avance usan `textarea` y mantienen saltos de línea al visualizar historial.
- **Historial editable**: ahora se puede editar una nota ya creada (contenido, `%` reportado y horas reales).
- **Evidencia editable por nota**: se pueden quitar fotos guardadas y agregar nuevas (máx. 5 por comentario).
- **Subida consistente en WebP**: las fotos nuevas del flujo de edición reutilizan el mismo optimizador de evidencia.
- **Menos errores en producción**: lectura de comentarios evita requerir índice compuesto y la IA aplica fallback local en GitHub Pages.

## [2.48.16] - 2026-02-15

### 🤖 Autoajuste por comentarios operativos

#### Mejoras
- **Detección de bloqueos en texto**: comentarios como `falta componente`, `pendiente`, `bloqueado` actualizan estado a `bloqueada` automáticamente.
- **Detección de fecha objetivo**: menciones tipo `jueves` o `dd/mm` extienden la fecha fin cuando supera la planificación actual.
- **IA más automática**: si no se informa `%` manual y no hay bloqueo, se aplica automáticamente el `%` sugerido por Grok.
- **Menos trabajo manual**: nota + evidencia + análisis ahora impactan directamente el estado/tiempo de la tarea.

## [2.48.15] - 2026-02-15

### 📝 Avance clicable con notas, fotos e IA en timeline

#### Mejoras
- **Click en Avance (%)**: desde la tabla timeline ahora abre modal de edición rápida por tarea.
- **Registro operativo completo**: en ese modal se puede actualizar `%`, agregar nota y adjuntar fotos de evidencia.
- **IA Grok en flujo rápido**: estimación y aplicación de porcentaje sugerido sin salir del timeline.
- **Ajuste automático de tiempo**: al reportar más horas reales, la tarea extiende fecha fin automáticamente.

## [2.48.14] - 2026-02-15

### ✅ Selección masiva por filtro completo

#### Mejoras
- **Seleccionar filtro**: en ubicación múltiple (admin) se agrega acción para marcar todas las tareas que cumplen el filtro actual.
- **Flujo más rápido**: evita depender de `Seleccionar página` cuando el filtro devuelve muchas tareas.

## [2.48.13] - 2026-02-15

### 📌 Ubicación masiva por selección (admin)

#### Mejoras
- **Selección múltiple en listado**: admin puede marcar varias tareas con checkbox en la pestaña `Tareas`.
- **Ubicación en lote**: nuevo flujo `Aplicar ubicación a seleccionadas` con selector jerárquico encadenado.
- **Persistencia masiva**: la ubicación elegida se guarda en todas las tareas seleccionadas en una sola acción.
- **Anti doble clic al eliminar**: en el diálogo de borrado, `Eliminar` se habilita tras 1s para reducir errores accidentales.

## [2.48.12] - 2026-02-15

### 🧩 Confirmación de borrado con Dialog UI

#### Mejoras
- **Confirmación visual estándar**: la `X` roja del timeline ahora abre modal UI con botones `Cancelar` y `Eliminar`.
- **Más claridad antes de borrar**: el modal muestra el nombre de la tarea para confirmar exactamente qué se eliminará.
- **Consistencia de interfaz**: se reemplaza `window.confirm` por componentes del sistema de diseño.

## [2.48.11] - 2026-02-15

### 🛡️ Confirmación al eliminar desde X roja

#### Mejoras
- **Confirmación previa**: al usar la `X` roja en tabla timeline ahora aparece `¿Eliminar tarea?` con el título de la tarea.
- **Menos borrados accidentales**: el borrado rápido mantiene velocidad, pero con una capa mínima de seguridad.

## [2.48.10] - 2026-02-15

### 🔎 Filtro único + eliminación rápida en tabla timeline

#### Mejoras
- **Buscador unificado**: se reemplazan los 3 buscadores (área/equipo/tarea) por un solo campo que filtra la lista completa de tareas visibles.
- **Borrado rápido admin**: nueva `X` roja por fila en tabla timeline, al lado de `Δ Plan (h)`, para eliminar tareas sin entrar al detalle.
- **Δ Plan más claro**: se explicita que la columna es diferencia en horas frente al baseline.

## [2.48.09] - 2026-02-15

### 🧭 Legibilidad de barras + dependencias más limpias

#### Mejoras
- **Texto más claro en barras**: incremento de tamaño/peso tipográfico y `drop-shadow` suave para lectura en fondos de progreso.
- **Dependencias por tipo más legibles**: codificación de color semántica (`FS/SS/FF/SF`) para distinguir relaciones rápidamente.
- **Trazado con halo**: doble trazo (base tenue + línea principal) para separar flechas del fondo y rejilla.
- **Ruta ortogonal refinada**: en dependencias hacia atrás se usa desvío lateral limpio para reducir cruces visuales.

## [2.48.08] - 2026-02-15

### 📏 Barras del timeline al doble de altura (2x)

#### Mejoras
- **Altura duplicada real en eje Y**: barra principal ajustada a `h-6` (doble respecto a la base `h-3`).
- **Lectura más clara**: texto interno centrado verticalmente para aprovechar el nuevo alto.
- **Interacción alineada**: handles de resize y líneas de dependencia recalibrados al nuevo centro de barra.

## [2.48.07] - 2026-02-15

### 🧱 Barras de timeline más legibles

#### Mejoras
- **Más altura de barra**: se incrementa el alto visual para ocupar mejor el carril y mejorar lectura.
- **Texto con contraste semántico**: el `título · %` adapta foreground según tramo de avance (destructive/warning/success).
- **Interacción más cómoda**: anclas de dependencia y handles de resize más grandes y centrados en la barra.
- **Alineación consistente**: dependencias y preview usan el centro real de barra para evitar sensación de desfase visual.

## [2.48.06] - 2026-02-15

### 🎨 Avance por rangos de color en timeline

#### Mejoras
- **Rangos visuales de progreso**: mini barra interna ahora usa `rojo` (0-30%), `amarillo` (31-70%) y `verde` (71-100%).
- **Lectura más rápida**: identificación instantánea del estado de avance sin abrir detalle.
- **Leyenda extendida**: se agregan referencias de color para interpretar cada tramo de porcentaje.

## [2.48.05] - 2026-02-15

### 📊 Progreso visual en barras del timeline

#### Mejoras
- **Mini barra de avance**: cada tarea ahora renderiza relleno interno proporcional al `%` de progreso.
- **Lectura inmediata**: se combina señal visual (relleno) con texto (`título · %`) para identificar estado sin abrir detalles.
- **Leyenda ajustada**: se diferencia fondo de barra vs relleno para interpretación rápida en operación.

## [2.48.04] - 2026-02-15

### 🏹 Dependencias más precisas + barras más informativas

#### Mejoras
- **Flechas robustas en casos desfasados**: ajuste del trazado para que dependencias entre tareas no alineadas entren correctamente a la barra destino.
- **Ruta ortogonal estable**: mejor lectura cuando una dependencia va hacia atrás o con desfase temporal importante.
- **Texto en barra**: cada barra de timeline muestra `título · % avance` para lectura directa sin abrir detalle.
- **Hover de data relevante**: tooltip nativo con estado, responsable, fechas y cantidad de dependencias por tarea.

## [2.48.03] - 2026-02-15

### 🧭 Timeline más limpio + jerarquía extendida de ubicación

#### Mejoras
- **Carga por técnico desacoplada del timeline**: se mueve a pestaña propia para reducir ruido visual en la vista temporal.
- **Acción directa de creación**: se agrega botón `Nueva tarea` en timeline para abrir rápidamente la configuración de alta.
- **Ubicación con 7 niveles jerárquicos**: en creación/edición de tarea se habilita selección encadenada desde `Área` hasta `Elemento`.
- **Listado más directo**: en tabla/listado de tareas se muestra solo el último nivel de jerarquía para lectura compacta.

## [2.48.02] - 2026-02-15

### 📏 Convenciones oficiales de release y commit

#### Mejoras
- **Estandarización de cierre**: se define como obligatorio cerrar cada mejora con versionado, validación, commit y push.
- **Formato único de commit release**: `release: vX.Y.Z <resumen-corto>` para trazabilidad consistente.
- **Checklist alineado al flujo real**: documentación actualizada con archivos de versión correctos y comando de verificación oficial.
- **Manejo explícito de non-fast-forward**: procedimiento de recuperación con `git pull --rebase` antes de reintentar `push`.

## [2.48.01] - 2026-02-15

### 🧼 Limpieza visual + edición por rol en Gantt

#### Mejoras
- **Menos ruido en timeline**: se elimina el bloque textual de propuesta/objetivo para priorizar información operativa.
- **Ubicación resumida**: en vistas y modal se muestra solo la parte útil final del área (sin la raíz jerárquica completa).
- **Edición de identidad de tarea por rol**: en edición rápida se puede cambiar título, área y equipo; disponible solo para `admin` y `supervisor`.
- **Dependencias rápidas más usables**: buscador de predecesora, selector de tipo con etiqueta explícita (`FS/SS/FF/SF`) y ayuda contextual para `Lag (h)`.
- **Tooltips en textos truncados**: hover con contenido completo en tabla/listado para mantener compacta la pantalla sin perder información.

## [2.48.00] - 2026-02-14

### 🧭 Dependencias visuales tipo GanttPRO (flecha + codo)

#### Mejoras
- **Dirección clara origen→destino**: líneas de dependencia ahora muestran punta de flecha para lectura inmediata del flujo.
- **Trazado en codo/curva**: dependencias persistidas y preview de arrastre se renderizan con camino más legible en lugar de segmento recto simple.
- **UX alineada al demo**: mejora visual de conexiones entre barras para acercarse al estilo validado en referencia.

## [2.47.99] - 2026-02-14

### 🧯 Hotfix deploy: Type check Gantt

#### Fixes
- **TypeScript en CI**: corregidos errores de tipado en `GanttPlannerPage` que hacían fallar la etapa `Type check` del workflow de GitHub Pages.
- **Deploy pipeline**: validado localmente el flujo `tsc --noEmit` + `lint` + `build` para alinear comportamiento con Actions.

## [2.47.98] - 2026-02-14

### 🚑 Fix deploy + vista compacta en Tareas

#### Fixes
- **Deploy GitHub Pages estabilizado**: corregida dependencia faltante de hook (`load`) que generaba warning de lint en CI y hacía fallar runs recientes.

#### Mejoras
- **Vista compacta en Tareas**: nuevo toggle ON/OFF para reducir altura de tarjetas y revisar más tareas por pantalla.
- **Compactación inteligente**: en modo compacto se prioriza lectura rápida y se muestra edición expandida al seleccionar tarea.

## [2.47.97] - 2026-02-14

### 🧹 Orden y pulido de pestañas Configuración / Tareas

#### Mejoras
- **Tareas más ordenada**: filtros agrupados en un bloque único con jerarquía visual más clara.
- **Configuración más guiada**: se agrega flujo sugerido y mejor estructura de formularios.
- **Lectura operativa mejorada**: textos de apoyo breves para orientar la acción sin saturar la pantalla.

## [2.47.96] - 2026-02-14

### 📘 Guía contextual de dependencias en modo D

#### Mejoras
- **Panel pedagógico contextual**: al activar modo dependencia (`D`) aparece una guía rápida con significado de `FS`, `SS`, `FF` y `SF`.
- **Apoyo en operación**: permite decidir el tipo correcto sin salir del timeline.
- **UX limpia**: la guía se oculta automáticamente al salir del modo dependencia.

## [2.47.95] - 2026-02-14

### 🏷️ Etiqueta flotante de tipo de dependencia

#### Mejoras
- **Feedback inmediato**: durante el drag de enlace se muestra una etiqueta flotante con el tipo detectado (`FS`, `SS`, `FF`, `SF`).
- **Confirmación visual rápida**: ayuda a verificar la lógica antes de soltar la conexión.
- **Mejor usabilidad operativa**: reduce errores al construir secuencias complejas en timeline.

## [2.47.94] - 2026-02-14

### 🎯 Resaltado de anclas destino en dependencias

#### Mejoras
- **Destino válido visible**: al arrastrar una dependencia, las anclas destino posibles se muestran resaltadas.
- **Snap más claro**: el punto objetivo activo se marca con énfasis visual para confirmar dónde se soltará el enlace.
- **Menos errores operativos**: mejora la precisión al conectar tareas en escenarios densos de timeline.

## [2.47.93] - 2026-02-14

### ⌨️ Modo dependencia con tecla D

#### Mejoras
- **Toggle rápido por teclado**: `D` activa/desactiva modo dependencia sin salir del timeline.
- **Operación más segura**: en modo dependencia se muestran anclas de enlace y se evita conflicto con mover/redimensionar barras.
- **Estado visible**: botón `Dependencias (ON/OFF · D)` en cabecera para control explícito del modo.

## [2.47.92] - 2026-02-14

### 🖱️ Dependencias por mouse + hover explicativo

#### Mejoras
- **Conexión directa en timeline**: ahora puedes arrastrar desde el inicio/fin de una tarea hacia inicio/fin de otra para crear dependencias.
- **Tipo automático por ancla**: el sistema asigna `FS`, `SS`, `FF` o `SF` según la combinación origen/destino elegida.
- **Hover educativo A/B**: cada línea de dependencia muestra explicación rápida y ejemplo real con nombres de tareas A y B.

## [2.47.91] - 2026-02-14

### 🧩 Editor visual de dependencias en Timeline

#### Mejoras
- **Dependencias en modal rápido**: desde edición de tarea puedes seleccionar predecesora, tipo `FS/SS/FF/SF` y `lag` en horas.
- **Alta/baja inmediata**: agregar o quitar dependencias sin salir de la vista timeline.
- **Flujo más GanttPRO**: gestión de lógica de secuencia directamente en el contexto operativo de la tarea.

## [2.47.90] - 2026-02-14

### 📊 GanttPRO UX: carga por técnico + variación baseline

#### Mejoras
- **Carga por técnico**: nuevo histograma en timeline con horas planificadas activas y cantidad de tareas visibles por responsable.
- **Desvío por tarea**: nueva columna `Δ Plan` en la tabla timeline para comparar duración real vs baseline por fila.
- **Lectura operativa más rápida**: detección de atraso/adelanto sin abrir detalle, mejorando priorización diaria.

## [2.47.89] - 2026-02-14

### 🧭 Evolución GanttPRO: dependencia, calendario y snap

#### Mejoras
- **Dependencias avanzadas**: auto-scheduling ahora considera `FS`, `SS`, `FF` y `SF` con `lagHours`.
- **Calendario hábil**: nuevo modo `Solo días hábiles (L-V)` para planificar sin caer en fin de semana.
- **Snap configurable**: arrastre/redimensión con granularidad `auto`, `1h`, `6h`, `12h` o `1 día`.
- **Feedback de drag**: tooltip temporal sobre la barra mostrando rango y duración mientras se mueve.

## [2.47.88] - 2026-02-14

### ⏱️ Duración plan vs real en Timeline

#### Mejoras
- **Duración rápida por unidad**: en el modal de edición de timeline ahora puedes aplicar duración por `horas` o `días`.
- **Reporte técnico de tiempo real**: comentarios de tarea aceptan `tiempo real (horas)` además de `% de avance`.
- **Auto-extensión por demora real**: si el tiempo real reportado supera lo planificado, la barra se amplía automáticamente.
- **Lectura diaria reforzada**: timeline con bandas diarias alternadas y líneas semanales más visibles para distinguir días.

## [2.47.87] - 2026-02-14

### 🪟 Edición rápida en modal PWA

#### Mejoras
- **Sin panel fijo**: Se elimina el bloque de edición superior que ocupaba espacio de trabajo.
- **Modal contextual**: La edición de tarea en timeline ahora se abre en diálogo adaptable a PWA.
- **Apertura por interacción**: doble clic en fila/barra o botón `Editar seleccionada` para modificar solo cuando corresponda.
- **Flujo compacto**: edición de fechas, horas y usuario en un único modal sin romper el layout del timeline.

## [2.47.86] - 2026-02-14

### ⚡ Acceso rápido a edición por doble clic

#### Mejoras
- **Doble clic en fila/barra**: abre edición rápida de la tarea seleccionada directamente desde Timeline.
- **Foco automático**: al abrir edición rápida, el cursor queda en `Inicio` para ajustar fecha/hora al instante.
- **Navegación más fluida**: mantiene selección de tarea y acelera ajustes operativos masivos.

## [2.47.85] - 2026-02-14

### 🛠️ Interacción operativa por tarea en Timeline

#### Mejoras
- **Buscador dedicado**: filtros directos por `Área`, `Equipo` y `Tarea` dentro del tab Timeline.
- **Selección rápida de tarea**: clic en fila o barra para enfocar la tarea activa.
- **Edición rápida en timeline**: ajuste de `fecha/hora inicio`, `fecha/hora fin`, `tiempo (horas)` y `usuario responsable` sin salir del panel.
- **Ventana temporal por página**: la escala del timeline toma tareas visibles para mejorar legibilidad y manipulación.

## [2.47.84] - 2026-02-14

### 🎯 Modo enfoque para Gantt (solo módulo)

#### Mejoras
- **Modo enfoque en `/gantt`**: Botón en topbar para ocultar sidebar y maximizar área útil del timeline.
- **Peek por hover**: En desktop, al acercar el mouse al borde izquierdo aparece temporalmente el menú lateral.
- **Persistencia de preferencia**: El modo enfoque se recuerda entre sesiones para el módulo Gantt.

## [2.47.83] - 2026-02-14

### 🧩 Timeline más usable (interacción + legibilidad)

#### Mejoras
- **Rango temporal por página**: El timeline usa la ventana de fechas de la página actual para evitar compresión extrema por outliers.
- **Barras robustas**: Se normalizan posiciones/ancho para mantener barras visibles e interactivas.
- **Splitter arrastrable**: Nuevo divisor entre tabla de tareas y timeline para ajustar columnas según necesidad operativa.
- **Eventos de mouse garantizados**: Las líneas de dependencia ya no bloquean interacción con drag/resize de barras.

## [2.47.82] - 2026-02-14

### 🔄 Refresh forzado de cliente + timeline demo activo

#### Mejoras
- **Bump de versión**: Se incrementa a `2.47.82` para activar detección de actualización en clientes que quedaron en sesión previa.
- **Timeline demo en productivo**: Se mantiene layout del planificador alineado a la propuesta visual (tabla izquierda + timeline profesional a la derecha).

## [2.47.81] - 2026-02-14

### 🗂️ Planificador Gantt con pestañas y preferencia persistente

#### Mejoras
- **Tres pestañas operativas**: Se separa el planificador en `Configuración`, `Tareas` y `Timeline` para navegación más clara.
- **Vista temporal por defecto**: El módulo abre inicialmente en `Timeline` para control inmediato de fechas y atraso.
- **Preferencia recordada**: Se guarda la última pestaña usada por usuario y se restaura automáticamente al volver.

## [2.47.80] - 2026-02-14

### 🧭 UX Gantt orientada a planta (Área/Equipo antes de Tarea)

#### Mejoras
- **Contexto primero**: En timeline se muestra `Área · Equipo · Tarea` para lectura más natural en operación.
- **Listado más claro**: Cada tarjeta prioriza `Área · Equipo` y luego el título de la tarea.
- **Propuesta visual alineada**: Demo HTML actualizada con columnas `Área`, `Equipo`, `Tarea`.

## [2.47.79] - 2026-02-13

### 🖱️ Timeline Gantt editable (drag + resize + propagación FS)

#### Mejoras
- **Drag en barra**: Las tareas del timeline se pueden mover horizontalmente para ajustar fechas rápidamente.
- **Resize lateral**: Se agregan handles en inicio/fin para cambiar duración desde la misma vista temporal.
- **Propagación automática FS**: Al actualizar una tarea, se recalculan sucesoras con dependencia `FS` respetando lag en horas.
- **Edición con permisos**: Interacción habilitada para responsable asignado o usuarios con permiso de edición.

## [2.47.78] - 2026-02-13

### 📏 Timeline Gantt más profesional (zoom + hoy + baseline)

#### Mejoras
- **Escala temporal configurable**: Timeline con selector `Día / Semana / Mes` para ajustar nivel de detalle.
- **Marcador de hoy**: Se agrega línea vertical de referencia temporal para detectar atrasos rápidamente.
- **Plan vs ejecución**: Nueva visualización `Baseline` (planificado) sobrepuesta con barra `Real` por tarea.
- **Base temporal persistente**: Las tareas guardan `baselineStartDate` y `baselineEndDate` para comparativa histórica.

## [2.47.77] - 2026-02-13

### 👷 Gantt técnico: avance operativo + IA + evidencia fotográfica

#### Mejoras
- **Avance manual por responsable**: El técnico asignado (o editor) puede actualizar `%` real de progreso desde el detalle de tarea.
- **Comentarios con evidencia**: Cada comentario de Gantt ahora permite adjuntar fotos de terreno para trazabilidad.
- **Estimación IA de progreso**: Integración con Grok para sugerir `%` de avance según comentarios recientes; se puede aplicar a la tarea.
- **Persistencia analítica**: Se guarda `aiSuggestedProgress` en tarea y `% reportado`/fotos en comentarios.

#### Infraestructura
- **Storage rules**: Se incorpora ruta `gantt/{taskId}/comments/{commentDraftId}/{fileName}` para subida segura de imágenes de comentarios.

## [2.47.76] - 2026-02-13

### 🧭 Gantt alineado a jerarquía de planta (Área/Equipo)

#### Mejoras
- **Filtro por área**: Se agrega filtro jerárquico de área en el listado de tareas Gantt.
- **Contexto visible por tarea**: Cada fila ahora muestra `Área · Equipo · rango de fechas`.
- **Creación más ordenada**: Formulario incorpora selector de `Área` y limita equipos por área seleccionada.
- **Importación Excel consistente**: La columna `Area` se mapea al nodo de jerarquía oficial cuando no hay match exacto de equipo.

## [2.47.75] - 2026-02-13

### 🚑 Hotfix crítico: pantallazo en Gantt

#### Fixes
- **ErrorBoundary / render crash**: Corregido fallo `A <Select.Item /> must have a value prop that is not an empty string` detectado tras carga masiva en Gantt.
- **Fuente del bug**: Se evitó que `id: ""` almacenado en documentos sobrescriba el `doc.id` real al leer tareas.
- **Persistencia segura**: `createGanttTask` excluye `id` del payload y `updateGanttTask` ignora campo `id` si llega por patch.

## [2.47.74] - 2026-02-13

### 🧯 Fix importación Gantt desde Excel simplificado

#### Fixes
- **Firestore `addDoc/updateDoc` robusto**: Se limpian automáticamente campos `undefined` (incluyendo estructuras anidadas) antes de persistir tareas Gantt.
- **Error corregido en importación**: Eliminado `Unsupported field value: undefined` al importar tareas desde Excel.

#### Mejoras
- **Compatibilidad de columna**: El parser de importación acepta `descipacion` como alias de descripción.
- **Carga simplificada estable**: Funciona correctamente con archivos mínimos tipo `Area / Equipo / Tarea`.

## [2.47.73] - 2026-02-13

### 🔐 Gantt operativo en cloud + carga masiva desde Excel

#### Fixes
- **Permisos Firestore Gantt**: Se agregan reglas para `ganttTasks` y `ganttTaskComments`, corrigiendo el error runtime `Missing or insufficient permissions` en el módulo.
- **Despliegue de reglas**: Reglas publicadas en el proyecto Firebase activo (`mantenimiento-planta-771a3`).

#### Mejoras
- **Importación de tareas desde Excel**: Nuevo apartado en `Planificador` para cargar archivos `.xlsx/.xls/.xlsm`, previsualizar resultados e importar tareas en lote.
- **Mapeo operativo y jerárquico**: La pre-carga identifica título/estado/prioridad/avance/fechas y vincula equipo por nombre/código; cuando aplica, conserva contexto de área en `hierarchyPath` para timeline.

## [2.47.72] - 2026-02-13

### 🧭 Gantt fase 2 + estabilidad de despliegue y autosave

#### Mejoras
- **Módulo único `Gantt`**: Integración ordenada como un módulo más del sistema (menú lateral + permisos), con sub-vistas internas `Planificador`, `Ejecutivo` y `Móvil`.
- **Planificación fase 2**: Dependencias FS/SS/FF/SF con lag, vista temporal, CPM/ruta crítica, simulación de retraso y comentarios por tarea.
- **Dashboard ejecutivo**: Métricas de avance, tareas críticas/atrasadas, carga por responsable y alertas de sobrecarga para operación.
- **Alertas Gantt**: Notificaciones locales y remotas (Cloud Function `sendGanttAlert`) para tareas críticas atrasadas.

#### Fixes
- **CI / GitHub Pages**: Corregidos errores de TypeScript en `AnalisisGrader` que bloqueaban el workflow de deploy.
- **Autosave Grader cloud**: Reglas Firestore actualizadas para permitir `graderAnalysisDrafts` (se elimina error `Missing or insufficient permissions` al autoguardar).

## [2.47.71] - 2026-02-13

### 💾 Sesiones confiables + autosave híbrido costo/operación

#### Mejoras
- **Sesión guardada consistente**: La vista `Sesión Guardada` ahora reutiliza `aggregates/insights/aiOutput` persistidos, evitando recálculos con data vacía al recargar.
- **Persistencia automática de trabajo**: Gates y configuración del wizard se restauran automáticamente (respaldo local + borrador cloud).
- **IA en Tendencia más auditable**: Se permite re-ejecutar IA múltiples veces, guardar corridas recientes, ver consistencia entre corridas y comparar `anterior vs actual`.
- **Trazabilidad IA reforzada**: El prompt exige explicar origen de métricas y significado de `impacto/score` en cada recomendación.
- **Modo de autoguardado configurable**: Nuevo selector `Modo normal` / `Modo ahorro` en cabecera con preferencia persistida.
- **Control de costo explícito**: Tooltip del modo incluye tiempos de política y estimación de `writes/hora` para decisión operativa.

#### Cost/UX
- **Default inteligente por entorno**: Producción inicia en `modo normal`; desarrollo/emulador inicia en `modo ahorro`.
- **Flujo híbrido operativo**: Guardado cloud forzado al pasar de `Config` a `Dashboard`, con throttling/debounce para reducir writes sin perder continuidad.

## [2.47.70] - 2026-02-13

### 🏷️ Etiqueta de estado en KPIs de peso

#### Mejoras
- **Mini badge en `Peso Promedio` y `Peso Mediana`**: Se agrega estado `OK / WARN / CRÍTICO` visible en ambas tarjetas.
- **Criterio unificado**: El badge usa la misma severidad de umbrales P0 configurados en el módulo.
- **Lectura operativa rápida**: Peso, calibre equivalente y estado del turno quedan juntos en el mismo box.

## [2.47.69] - 2026-02-13

### 🎯 KPI de peso simplificado (sin duplicados)

#### Mejoras
- **Integración de calibre en peso**: `Calibre por Peso Prom.` y `Calibre por Peso Med.` se integran dentro de las tarjetas `Peso Promedio` y `Peso Mediana`.
- **Menos ruido visual**: Se eliminan dos boxes duplicados y se mantiene la información completa en un solo bloque por métrica.
- **Lectura más rápida**: El operador ve valor de peso + calibre equivalente en la misma tarjeta.

## [2.47.68] - 2026-02-13

### 🧩 Unificación de severidad P0 en dashboard

#### Mejoras
- **KPI principal unificado**: El KPI `Punto Cero` ahora usa los mismos umbrales configurados (`warn/crítico`) en lugar de cortes fijos.
- **P0 por lote alineado**: Tabla y gráfico de `Punto Cero por Lote` usan la misma regla de severidad para color/estado.
- **Recomendación temprana consistente**: La prioridad de acciones en `Tendencia` reutiliza el mismo evaluador de severidad P0.
- **Menos contradicciones visuales**: KPI, lotes, tendencia e insights quedan bajo un único criterio operativo.

## [2.47.67] - 2026-02-13

### 🧠 Insights alineados con umbral crítico de P0

#### Mejoras
- **Severidad consistente**: El insight `Punto Cero elevado` ahora usa `pointZeroPctCritical` para marcar `critical`.
- **Sin lógica heredada ambigua**: Se elimina la dependencia de `warn * 2` para este caso.
- **Transparencia en evidencia**: El insight muestra tanto umbral `warn` como umbral `crítico` usados en la evaluación.

## [2.47.66] - 2026-02-13

### 📌 Persistencia de umbral crítico de Punto Cero

#### Mejoras
- **Crítico persistente**: `pointZeroPctCritical` ahora forma parte de `errorThresholds` del análisis.
- **Edición en ambas vistas**: Se puede ajustar en `Tendencia` y también en `Configuración del análisis`.
- **Sincronización completa**: Cambiar el umbral crítico en `Tendencia` actualiza la configuración activa del wizard, igual que el `warn`.
- **Coherencia operativa**: Recomendaciones de reacción temprana usan umbrales persistidos (`warn` + `crítico`) en toda la sesión.

## [2.47.65] - 2026-02-13

### 🧭 Umbrales visibles y ajustables en Tendencia

#### Mejoras
- **Edición directa en dashboard**: La tarjeta `Reacción temprana` en `Tendencia` ahora permite ajustar `Umbral P0 Warn (%)` y `Umbral P0 Crítico (%)` sin volver a Configuración.
- **Recomendaciones en vivo**: Al cambiar umbrales, la prioridad (`alta/media/baja`) y textos de acciones se recalculan inmediatamente.
- **Persistencia de umbral warn**: El valor `warn` se sincroniza con la configuración del wizard para mantener coherencia operativa dentro de la sesión.

## [2.47.64] - 2026-02-13

### 🎛️ Prioridad de reacción alineada a umbrales de planta

#### Mejoras
- **Prioridad dinámica en Tendencia**: Las recomendaciones automáticas ya no usan cortes fijos; ahora usan `pointZeroPctWarn` configurado en el módulo.
- **Escalado crítico consistente**: El estado crítico se calcula sobre el umbral operativo (no hardcodeado), para reflejar mejor la realidad de cada planta.
- **Trazabilidad visible**: Cada recomendación muestra P0 proyectado y umbrales usados (`warn`/`crítico`) para facilitar decisión en turno.

## [2.47.63] - 2026-02-13

### ⚡ Tendencia: recomendaciones duales para reacción temprana

#### Mejoras
- **Automática por proyección**: En la pestaña `Tendencia` se muestran sugerencias directas de gates usando la proyección de cierre del turno.
- **IA visible en la misma pestaña**: Se muestran recomendaciones de IA (Grok) dentro de `Tendencia`; si aún no existen, se puede ejecutar `Analizar ahora` desde ahí.
- **Acción inmediata**: Las recomendaciones automáticas permiten `Aplicar` o muestran badge `Aplicada` cuando ya están ejecutadas.

## [2.47.62] - 2026-02-13

### 🔮 Tendencia de turno completo con proyección temprana

#### Mejoras
- **Eje temporal completo del turno**: La pestaña `Tendencia` ahora mantiene visible todo el horario del turno (inicio→fin), aunque solo haya 1-2 horas cargadas.
- **Datos observados + tramo proyectado**: Se dibuja la serie real y una serie punteada de tendencia probable para el resto del turno.
- **Proyección de piezas y Punto Cero al cierre**: Se agrega gráfico de piezas por intervalo con estimación de cierre para reaccionar antes ante desvíos.
- **Contexto IA enriquecido**: El análisis IA recibe la cobertura temporal y proyección de cierre para sugerir acciones de gates de forma más anticipada con data parcial.

## [2.47.61] - 2026-02-12

### ✅ Estado visual de sugerencias aplicadas

#### Mejoras
- **Badge `Aplicada`**: Las sugerencias de gate ahora muestran estado visual cuando la configuración actual ya coincide con el cambio recomendado.
- **Acción limpia**: El botón `Aplicar` solo aparece para sugerencias pendientes; en las ya aplicadas se muestra el badge en verde.
- **Seguimiento operativo**: Facilita saber qué acciones ya fueron ejecutadas sin revisar manualmente cada compuerta.

## [2.47.60] - 2026-02-12

### ⚡ Acción rápida: aplicar sugerencia de gate

#### Mejoras
- **Botón `Aplicar` por sugerencia**: En `Dispersión por Lote`, cada acción de cambio de gate ahora permite aplicar directamente calibre/calidad sugeridos.
- **Actualización inmediata de configuración**: Al aplicar, la gate se actualiza en el estado actual del análisis.
- **Navegación automática a Configuración**: Después de aplicar, la vista vuelve a Configuración de Gates para validar/ajustar visualmente el cambio.
- **Recalculo continuo de sugerencias**: Al regresar al dashboard, las recomendaciones se generan nuevamente según la configuración ya modificada.

## [2.47.59] - 2026-02-12

### 🎯 Sugerencias directas de cambio por gate

#### Mejoras
- **Acción explícita por compuerta**: En dispersión por lote, las recomendaciones ahora se muestran en formato directo: `Gate X: cambiar calibre A → B y calidad ...`.
- **Calidad incluida en la instrucción**: Cada sugerencia indica calidad actual y calidad sugerida/mantenida para ejecutar ajuste operativo completo.
- **Top acciones priorizadas**: Se muestran hasta 3 cambios con mayor impacto para facilitar ejecución rápida en planta.
- **Recálculo con configuración actual**: Al cambiar gates en Configuración y volver al Dashboard, las sugerencias se regeneran automáticamente con los nuevos valores.

## [2.47.58] - 2026-02-12

### 📊 Dispersión CV por lote + tooltips estadísticos pedagógicos

#### Mejoras
- **Nuevo gráfico `Dispersión por Lote (CV%)`**: Visualiza homogeneidad por lote con semáforo (`🟢🟡🟠🔴`) y tooltip con `x̄`, `σ` y `N`.
- **Sugerencias operativas**: Se agrega lectura accionable bajo el gráfico (lote más variable + recomendación de ajuste y vínculo con sugerencias de gates existentes).
- **Columna `CV %` en tablas**: `Comparativa de Lotes` y `Detalle por Intervalo` ahora muestran `CV` visible y coloreado.
- **Tooltips para no expertos**: Se añaden leyendas explicativas para `CV`, `Promedio`, `Mediana` y métricas de tendencia para facilitar adopción por usuarios operativos.

## [2.47.57] - 2026-02-12

### 📍 UX: Ver Dashboard visible + leyenda CV fija

#### Mejoras
- **Botón `Ver Dashboard` más arriba**: Se agrega barra rápida sticky en Configuración de Gates para acceder al dashboard sin bajar al final de la página.
- **Acceso más claro al cargar datos**: Mensaje contextual indica que ya se puede abrir el dashboard en cualquier momento.
- **Leyenda fija de semáforo CV**: En `Comparativa de Lotes` y `Detalle por Intervalo` se muestra guía visible (`🟢🟡🟠🔴`) sin depender de hover.
- **Lectura operativa más rápida**: El equipo visualiza umbrales de dispersión directamente en pantalla mientras revisa los valores `σ`.

## [2.47.56] - 2026-02-12

### 🧾 σ ordenado por fila + semáforo en celdas

#### Mejoras
- **Tooltip de cabecera simplificado**: Se eliminan ejemplos largos en `σ` para reducir ruido visual.
- **Explicación por cada valor**: Cada celda `σ` en `Comparativa de Lotes` y `Detalle por Intervalo` incluye tooltip propio con explicación puntual del valor mostrado.
- **Semáforo directo en tabla**: Valores `σ` ahora muestran color + emoji según `CV%` (`🟢🟡🟠🔴`) para lectura inmediata.
- **Contexto real por fila**: El hover de cada `σ` muestra `x̄`, `σ`, `N`, banda `x̄±σ` y `CV%` de esa fila, explicando por qué aparece ese número.

## [2.47.55] - 2026-02-12

### 🚦 Semáforo CV en tooltips de desviación estándar

#### Mejoras
- **Semáforo visible en hover**: Tooltips de `σ` en `Lotes` y `Tendencia` ahora muestran estado por `CV%` con `🟢🟡🟠🔴`.
- **Umbrales explícitos**: Se agrega guía directa en tooltip (`🟢 <8%`, `🟡 8-11.9%`, `🟠 12-19.9%`, `🔴 ≥20%`).
- **Lectura más accionable**: Los ejemplos dinámicos ahora incluyen etiqueta de dispersión según semáforo para entender rápidamente severidad.

## [2.47.54] - 2026-02-12

### 📈 Tooltip σ contextual en tendencia por intervalo

#### Mejoras
- **Tooltip dinámico en `wt.stdDev`**: El hover de `σ (g)` en `Detalle por Intervalo` ahora usa datos reales de la serie de tendencia.
- **Ejemplo explicativo con valores visibles**: Muestra `x̄`, `σ`, piezas del intervalo y banda aproximada `x̄ ± σ` para entender por qué aparece ese valor.
- **Interpretación operativa**: Agrega `CV%` con etiqueta de dispersión (baja/media/alta) para facilitar lectura en planta.
- **Comparativo automático**: Incluye también un ejemplo del intervalo más variable para contraste rápido.

## [2.47.53] - 2026-02-12

### 📐 Tooltip σ con ejemplo real por lote

#### Mejoras
- **Explicación contextual en hover**: El tooltip de `σ (g)` en `Comparativa de Lotes` ahora explica que cada valor se calcula con los pesos reales del lote.
- **Ejemplo directo con datos mostrados**: Se incluye ejemplo dinámico usando `x̄` y `σ` del lote visible, con banda aproximada `x̄ ± σ`.
- **Lectura operativa**: Se agrega interpretación con `CV%` y nivel de dispersión (baja/media/alta) para entender por qué aparece ese valor.
- **Caso más disperso**: Si aplica, el tooltip añade un segundo ejemplo del lote con mayor σ para contraste rápido.

## [2.47.52] - 2026-02-12

### 🪟 Fix: hover de tooltips visible sobre tablas/cards

#### Correcciones
- **InfoTooltip en portal**: El tooltip ahora se renderiza en `document.body` para evitar que quede bajo elementos con `overflow`.
- **Posición robusta en viewport**: Se calcula en `fixed` y se reubica automáticamente en resize/scroll.
- **Comparativa de Lotes corregida**: Tooltips de encabezados (`Peso Prom.`, `Mediana`, `σ`, `P0 %`) quedan totalmente visibles.
- **Fix transversal**: El ajuste aplica a todos los `InfoTooltip` del dashboard y demás vistas que usan el componente.

## [2.47.51] - 2026-02-12

### 🧩 Lotes: hover visible y validación explícita de % P0

#### Mejoras
- **Hover más visible en gráficos**: Se ajusta el contenedor de charts en `Lotes` con `overflow-visible` y layout estable para evitar ocultamiento visual del tooltip.
- **Interacción más consistente**: Se habilita `interaction: index` con `intersect: false` para facilitar lectura al pasar el mouse por barras densas.
- **% P0 recalculado en UI**: El valor mostrado usa fórmula explícita `pointZeroPieces / pieces * 100` con redondeo a 2 decimales.
- **Trazabilidad en tooltip**: Se muestra fracción completa `P0/Total` junto al porcentaje para validar rápidamente el cálculo por lote.
- **Tabla y gráfico sincronizados**: El `% P0` mostrado en comparativa y en barra de Punto Cero usa la misma métrica validada.

## [2.47.50] - 2026-02-12

### 🧼 Refinamiento visual anti-ruido en tabla de Clasificación P0

#### Mejoras
- **Jerarquía tipográfica mejorada**: Causa principal más clara y descripción secundaria más suave.
- **Ruido reducido en filas**: Bordes y fondos suavizados para facilitar escaneo horizontal.
- **Lectura numérica más limpia**: Columnas de métricas con `tabular-nums` para mejor alineación visual.
- **Encabezados más legibles**: Estilo compacto en mayúsculas con contraste controlado.
- **Detalle expandido más discreto**: Bloque drill-down con menor agresividad visual y mejor continuidad.

## [2.47.49] - 2026-02-12

### 🎨 Mejora visual: Clasificación Punto Cero
- **Paleta consistente por causa**: Colores fijos por tipo de causa para evitar ambigüedad entre vista y tabla.
- **Leyenda renovada**: Se agrega leyenda visual compacta con color, piezas, `% P.Cero` y `% Total` por causa.
- **Tabla sincronizada con colores**: Cada fila de causa muestra indicador cromático del mismo color del donut.
- **Tooltip más informativo**: Incluye `P.Cero` y `% Total` para lectura rápida en hover.

## [2.47.48] - 2026-02-12

### 📉 Corrección: % por causa acumulado desde inicio de turno

#### Mejoras
- **Lógica corregida**: El gráfico de evolución por causa deja de usar `% por intervalo` y pasa a `% acumulado del turno`.
- **Inicio en 0%**: Se agrega punto base de inicio para cada causa (`0%` al arranque del turno).
- **Cierre consistente**: El último punto ahora debe cuadrar con el `% total` final de cada causa en el resumen.
- **Tooltip ampliado**: Muestra `% acumulado` y también contexto del intervalo (`causa intervalo / total intervalo`).
- **Rotulado claro**: Título y eje Y actualizados para reflejar que es métrica acumulada del turno.

## [2.47.47] - 2026-02-12

### 📈 Evolución temporal de % por causa en Punto Cero

#### Mejoras
- **Nuevo gráfico de tendencia por causa**: Se añade línea temporal de porcentaje para cada causa (No leído por fotocélula, Fuera de límites, Puerta no preparada, etc.).
- **Base porcentual clara**: Cada punto se calcula como `% de la causa sobre el total de piezas del intervalo`.
- **Lectura operacional de turno**: Permite ver si cada causa sube, baja o se mantiene durante el análisis.
- **Tooltip detallado**: Muestra ventana temporal y relación `piezas causa / piezas totales del intervalo`.
- **Mismo anclaje temporal real**: Usa la misma lógica de intervalos anclados al primer registro del turno para consistencia visual.

## [2.47.46] - 2026-02-12

### ⏱️ Patrón por intervalo anclado al primer registro real

#### Mejoras
- **Inicio temporal corregido**: El gráfico de patrón por intervalos ya no ordena por reloj del día (`00:00..23:00`) cuando el turno cruza medianoche.
- **Anclaje por datos reales**: La primera ventana del patrón ahora inicia en el timestamp del **primer registro filtrado** del archivo pieza-a-pieza.
- **Secuencia cronológica real**: Los buckets se construyen en cadena desde ese primer registro, manteniendo continuidad temporal operativa.
- **Rangos consistentes**: Tooltip y tarjetas comparativas usan la misma lógica de ventanas (`desde - hasta`) basada en ese anclaje.

## [2.47.45] - 2026-02-12

### 🕒 Claridad temporal por intervalo + ajuste de interacción

#### Mejoras
- **Snap removido**: Se elimina el comportamiento de alineación automática de tarjetas para mantener arrastre libre y predecible.
- **Semántica temporal visible**: En patrón por intervalo se expone claramente que cada punto representa una **ventana de tiempo** según el intervalo activo.
- **Ejemplo operativo en UI**: Se agrega guía explícita (p. ej. 22:00 = 21:00 - 22:00 cuando el intervalo es 60 min).
- **Tooltip con ventana**: El tooltip ahora muestra la ventana completa del punto (`desde - hasta`) además de piezas y desglose calibre/calidad.
- **Tarjetas fijadas con rango**: Cada tarjeta comparativa fija incluye el rango temporal del punto para comparación directa entre ventanas.

## [2.47.44] - 2026-02-12

### 🧲 Snap opcional en comparaciones del patrón temporal

#### Mejoras
- **Snap ON/OFF**: Se agrega control para activar o desactivar ajuste automático de tarjetas comparativas.
- **Anti-solape**: Con snap activo, las tarjetas se reacomodan en grilla para evitar que se monten entre sí.
- **Ajuste al soltar**: Al terminar de arrastrar, la tarjeta se normaliza visualmente y conserva conexión al punto origen.
- **Límites del gráfico**: El movimiento queda acotado al área del chart para mantener la comparación visible.

## [2.47.43] - 2026-02-12

### 📌 Comparación visual fija en patrón por intervalo

#### Mejoras
- **Click para fijar puntos**: En el gráfico de patrón por intervalo, al hacer click en un punto se crea una tarjeta fija con su detalle de piezas, calibre y calidad.
- **Comparación múltiple**: Se pueden fijar varios puntos simultáneamente para comparar intervalos a simple vista.
- **Tarjetas arrastrables**: Cada tarjeta se puede mover libremente para acomodar la visualización.
- **Conector al dato origen**: Cada tarjeta mantiene una línea visual hacia su punto específico del gráfico.
- **Cierre individual**: Cada comparación fija incluye botón `X` para quitarla sin afectar las demás.

## [2.47.42] - 2026-02-12

### 🧩 Tooltip enriquecido en patrón por intervalo

#### Mejoras
- **Hover con detalle operativo**: En el gráfico de patrón temporal (intervalo configurable), el tooltip ahora muestra desglose de piezas por **calibre** y por **calidad** para cada punto/intervalo.
- **Lectura de causa más rápida**: Permite identificar en el instante si un evento horario está concentrado en un calibre o calidad específica.

## [2.47.41] - 2026-02-12

### ⏱️ Intervalo configurable en patrón temporal P0

#### Mejoras
- **Patrón temporal flexible**: El gráfico de patrón en Punto Cero ahora permite ajustar granularidad desde **1 minuto hasta 60 minutos**.
- **Control rápido en UI**: Se agrega selector directo de intervalo (min) para cambiar resolución sin recargar análisis.
- **IA contextual**: El intervalo seleccionado se incorpora al contexto de `patternFocus` enviado al análisis IA para diagnósticos más precisos en ventanas temporales.

## [2.47.40] - 2026-02-12

### 📊 Patrones Punto Cero por causa, horario e IA

#### Mejoras
- **Filtro por causa + horario**: En `Análisis Grader > Punto Cero` se incorpora filtro interactivo por causa y rango horario.
- **Patrones por calibre y calidad**: Al filtrar, se recalculan automáticamente porcentajes y piezas por calibre y calidad para identificar concentraciones.
- **Patrón temporal**: Se añade visualización por hora para detectar ventanas con eventos significativos.
- **IA contextual (Groq)**: El análisis IA ahora recibe el foco filtrado (causa/horario/distribuciones) para diagnóstico orientado a patrones operacionales.

## [2.47.39] - 2026-02-12

### 🔧 Calibre por peso en detalle y exportes

#### Mejoras
- **Punto Cero (pieza a pieza)**: En el detalle de registros, cuando `Calibre` llega vacío o con `-`, ahora se muestra el calibre calculado según `Peso/pza (g)`.
- **Export JSON**: Se normaliza el calibre en los registros de `pointZeroClassification.causes[].records` usando el mismo cálculo por peso.
- **Export Excel**: Se agrega hoja **P0 Detalle Piezas** con calibre resuelto por peso para cada registro.
- **Export PDF**: Se agrega sección **Detalle Pieza-Pieza Punto Cero** con calibre calculado por peso.

## [2.47.38] - 2026-02-12

### 📊 Telemetría operativa + mantenimiento de calidad

#### Mejoras
- **Telemetría Sensores**: Se añade mini tabla visible con las últimas 5 lecturas (hora, temperatura, humedad) debajo del gráfico histórico.
- **Dato visible primero**: Se refuerza el patrón de lectura rápida en paneles de telemetría para operación en planta.

#### Correcciones
- **Lint Grader**: Eliminada variable no utilizada en analítica para mantener higiene de warnings en VS Code.

## [2.47.37] - 2026-02-12

### 📈 Gráficos con dato visible primero (Grader + Telemetría)

#### Mejoras
- **Grader Dashboard**: Se expone correspondencia de calibre según peso en KPIs y tablas (promedio/mediana → calibre).
- **Distribuciones Grader**: Gráficos modernizados con tablas visibles de apoyo (piezas, porcentaje, peso), reduciendo dependencia de hover.
- **Telemetría Equipos**: Gráfico de historial ahora muestra métricas visibles (actual, promedio, min-max, última lectura).
- **Telemetría Sensores**: Componente de gráficos agrega panel de métricas resumidas (temperatura/humedad, rango y cantidad de lecturas) para lectura rápida.
- **UX Operación**: Hover se mantiene como soporte, pero la información crítica queda expuesta por defecto para uso en planta.

## [2.47.19] - 2026-02-10

### 📊 Filtro por tipo de error en P0

#### Mejoras
- **P0 Pivote**: Filtros por tipo de error (Fuera de límites, Fuera de rango, No leído por fotocélula, Puerta no preparada, etc.) como slicers de Excel.
- **Gráfico barras apiladas**: Barras Error × Calidad por Calibre con stacks por tipo de error y colores por calidad.
- **Tabla pivote filtrable**: Tabla y totales se actualizan según el filtro seleccionado.

## [2.47.18] - 2026-02-10

### ⏰ Turnos con hora y minuto

#### Mejoras
- **Turnos**: Horarios de turnos ahora soportan hora:minuto (HH:MM) en vez de solo hora entera.
- **UI**: Inputs de tipo `time` para inicio/fin de cada turno.
- **Inferencia**: Clasificación de turno por hora+minuto precisa.
- **Backward compatible**: Datos existentes sin minutos defaultean a :00.

## [2.47.17] - 2026-02-10

### 🧯 Fix tsc --noEmit CI

#### Correcciones
- **useToast**: Tipo `Action` con discriminantes literales para narrowing correcto en `tsc --noEmit`.

## [2.47.16] - 2026-02-10

### 🧯 Fix Deploy

#### Correcciones
- **Repuestos**: Restaurados helpers y tipos para build en CI.

## [2.47.15] - 2026-02-10

### ✅ Lint Limpio

#### Correcciones
- **Hooks**: Dependencias estabilizadas y funciones memoizadas.
- **Utilidades**: Ajustes menores de tipado/JSX.

## [2.47.14] - 2026-02-10

### 🧹 Ajustes de Hooks

#### Correcciones
- **Calendario/Upload**: Dependencias de hooks estabilizadas y memo de carga de turnos.

## [2.47.13] - 2026-02-10

### 🧩 Fix VS Code

#### Correcciones
- **Calendario**: Reparado JSX y hooks movidos fuera del render.
- **Horarios de turnos**: Ajustes de tipado y null checks en configuracion.

## [2.47.12] - 2026-02-10

### 🗓️ Horarios Configurables + Cache Correcto

#### Añadido
- **Horarios de turnos**: Configuracion global de rangos por turno (dia/tarde/noche).
- **Auto-seleccion**: El calendario preselecciona el ultimo dia con uploads.

#### Cambios
- **Resumen diario limpio**: Si se actualiza un archivo del turno, se invalida el resumen guardado.

#### Seguridad
- **Reglas Firestore**: Supervisores pueden invalidar `graderDailySummaries`.

## [2.47.11] - 2026-02-10

### 🕒 Turno Tarde + Reemplazo de Uploads

#### Añadido
- **Turno tarde**: Disponible en carga, calendario y configuración de análisis.
- **Reemplazo por turno**: Si se carga un archivo nuevo para el mismo día y turno, se actualiza el último.

#### Cambios
- **Calendario sin duplicados**: Se muestran solo los últimos archivos por día/turno.

## [2.47.10] - 2026-02-10

### 📊 Resumen Diario Persistido

#### Añadido
- **KPIs persistidos**: El calendario guarda resúmenes diarios por turno para evitar recalculo.
- **Estado visible**: Indicador "Guardado/Calculado" para distinguir cache vs. nuevo calculo.

#### Seguridad
- **Reglas Firestore**: Nueva colección `graderDailySummaries` habilitada.

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
