# 🚀 Sistema de Versionado - Mantenimiento PWA

## Versión Actual: **v2.2.24**

**Fecha de lanzamiento**: 9 de enero de 2026  
**Estado**: ✅ PRODUCCIÓN READY  
**Build**: ✅ Último build local OK

---

## 📋 Información de la Versión

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
