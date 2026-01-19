# Módulo de Repuestos - Guía de Migración

## Estado Actual ✅

### Completado:
1. **Estructura de carpetas** ✅
   - `apps/pwa/src/pages/repuestos/`
   - `apps/pwa/src/hooks/repuestos/`
   - `apps/pwa/src/components/repuestos/`
   - `apps/pwa/src/utils/repuestos/`

2. **Types completos** ✅
   - `apps/pwa/src/types/repuestos.ts` (~270 líneas)
   - Todas las interfaces: TagGlobal, TagAsignado, Repuesto, Machine, PlantMap, PlantAsset, etc.

3. **Hooks principales** ✅
   - `apps/pwa/src/hooks/repuestos/useRepuestos.ts` (~865 líneas)
   - `apps/pwa/src/hooks/repuestos/useTags.ts` (~235 líneas)

## Hooks Pendientes 🔄

Necesitas copiar del repo externo (https://github.com/orelcain/Repuestos-App):

### 1. useMachines.ts
```bash
# Copiar de: src/hooks/useMachines.ts
# Adaptar imports: '../config/firebase' -> '@/services/firebase'
# Adaptar types: '../types' -> '@/types/repuestos'
```

### 2. useStorage.ts
```bash
# Copiar de: src/hooks/useStorage.ts
# Maneja subida de imágenes con compresión
# Usar Firebase Storage existente
```

### 3. usePlantMaps.ts y usePlantAssets.ts
```bash
# Copiar de: src/hooks/usePlantMaps.ts
# Copiar de: src/hooks/usePlantAssets.ts
# Para gestión de mapas de planta y assets
```

### 4. useLocalStorage.ts, useToast.ts, useTheme.ts, useUndoRedo.ts
```bash
# Hooks auxiliares para UX
# Puedes usar los existentes en la app o copiar estos específicos
```

## Componentes Principales 🎨

### Dashboard.tsx (Principal - ~2600 líneas)
```typescript
// Ruta origen: src/components/Dashboard.tsx
// Ruta destino: apps/pwa/src/pages/repuestos/Dashboard.tsx

Características clave:
- Multi-máquina (tabs con drag & drop)
- Panel dividido (tabla + manual PDF)
- Exportación Excel/PDF
- Sistema de tags/eventos
- Galería de imágenes
- Historial de cambios
- Backup automático
```

### RepuestosTable.tsx (~2500 líneas)
```typescript
// Ruta origen: src/components/repuestos/RepuestosTable.tsx
// Ruta destino: apps/pwa/src/components/repuestos/RepuestosTable.tsx

Características:
- Tabla responsive con columnas configurables
- Filtros avanzados
- Paginación
- Búsqueda
- Contextos duales (solicitud + stock)
- Integración con plant assets
```

### Formularios y Modales
```bash
RepuestoForm.tsx          # Crear/editar repuesto
TagManagerModal.tsx       # Gestión de tags
TagEventSelector.tsx      # Selector de tags en formulario
HistorialModal.tsx        # Historial de cambios
DeleteConfirmModal.tsx    # Confirmar eliminación
ImportModal.tsx           # Importar desde Excel
```

## Componentes UI Auxiliares 🔧

### PDF Viewers (Lazy loaded)
```typescript
// src/components/pdf/PDFViewer.tsx
// src/components/pdf/PDFMarkerEditor.tsx
// Con anotaciones y navegación
```

### Galerías y Media
```typescript
// src/components/gallery/ImageGallery.tsx
// Galería con zoom, reordenamiento, etc.
```

### Machine Management
```typescript
// src/components/machines/MachineSelector.tsx
// src/components/machines/MachineFormModal.tsx
// Gestión de máquinas y manuales
```

## Utilidades 🛠️

### exportUtils.ts (~1500 líneas)
```typescript
// src/utils/exportUtils.ts
// Exportación Excel con ExcelJS
// Exportación PDF con jsPDF
```

### imageUtils.ts
```typescript
// src/utils/imageUtils.ts
// Compresión de imágenes
// Conversión de formatos
```

### admin.ts
```typescript
// src/utils/admin.ts
// Helper para verificar permisos admin
```

## Integración en App Principal 🔌

### 1. Ruta en App.tsx
```typescript
// apps/pwa/src/App.tsx
import { RepuestosDashboard } from './pages/repuestos/Dashboard'

// Agregar ruta:
<Route path="/repuestos" element={<RepuestosDashboard />} />
```

### 2. Link en Sidebar
```typescript
// apps/pwa/src/components/layout/Sidebar.tsx
{
  label: 'Repuestos',
  path: '/repuestos',
  icon: Package, // from lucide-react
  badge: 'Nuevo'
}
```

### 3. Context Provider (si usa MachineContext)
```typescript
// Envolver la app con MachineProvider
<MachineProvider>
  <Routes>
    {/* ... */}
  </Routes>
</MachineProvider>
```

## Dependencias NPM 📦

Verificar que estén instaladas:
```bash
pnpm add exceljs jspdf jspdf-autotable
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities # Para drag & drop
pnpm add react-pdf # Si usas PDF viewer
```

## Firestore Collections 🗄️

El módulo usa estas colecciones:
```
machines/{machineId}/repuestos/              # Repuestos por máquina
machines/{machineId}/repuestos/{id}/historial/  # Historial de cambios
machines/{machineId}/settings/tags           # Tags globales
plantMaps/                                   # Mapas de planta
plantAssets/                                 # Assets de planta

# Legacy (compatibilidad):
repuestosBaader200/  # Para baader-200
settings/tags        # Tags legacy para baader-200
```

## Firebase Storage 📁

Estructura de carpetas:
```
machines/{machineId}/repuestos/{repuestoId}/
  - imagenesManual/     # Imágenes del manual
  - fotosReales/        # Fotos reales
  
machines/{machineId}/manuales/  # PDFs de manuales
plantMaps/                      # Mapas de planta
plantAssets/                    # Fotos de assets
```

## Hooks Pendientes 🔄

Ya migrados en `apps/pwa/src/hooks/repuestos/`:
- useMachines.ts
- useStorage.ts
- usePlantMaps.ts
- usePlantAssets.ts

Faltan (copiar del repo externo si no reutilizamos los globales):
- useLocalStorage.ts, useToast.ts, useTheme.ts, useUndoRedo.ts
# Dev
pnpm -C apps/pwa dev

# Lint
pnpm -C apps/pwa lint

# Ver errores de TypeScript
pnpm -C apps/pwa tsc --noEmit
```

## Notas Importantes ⚠️

1. **Compatibilidad Firebase**: La app externa usa la misma configuración de Firebase
2. **Lazy Loading**: Los componentes PDF se cargan lazy para optimizar bundle
3. **Multi-máquina**: El sistema soporta múltiples máquinas con tabs
4. **Tags System**: Sistema de eventos/tags para clasificar repuestos (solicitud/stock)
5. **Backup**: Sistema de backup automático en localStorage
6. **Export**: Exportación Excel con estilos y PDF con gráficos

## Recursos 📚

- Repo externo: https://github.com/orelcain/Repuestos-App
- App deployada: https://orelcain.github.io/Repuestos-App/
- Firebase: Mismo proyecto (mantenimiento-planta-771a3)
