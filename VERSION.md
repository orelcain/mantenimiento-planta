# 🚀 Sistema de Versionado - Mantenimiento PWA

## Versión Actual: **v2.16.12**

**Fecha de lanzamiento**: 14 de enero de 2026  
**Estado**: ✅ PRODUCCIÓN READY  
**Build**: ✅ Último build local OK

---

## 📋 Información de la Versión

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
