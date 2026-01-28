# 🗺️ Plan de Implementación: Mapas con Marcadores para Incidencias

## Fecha: 28 de enero de 2026
## Estado: ✅ IMPLEMENTACIÓN COMPLETA

---

## 📋 Resumen Ejecutivo

Implementar un sistema de mapas interactivos que permita:
1. **Gestión de Mapas (Admin)**: Cargar imágenes de mapas asociados a ubicaciones físicas
2. **Incidencias Georreferenciadas**: Colocar marcadores en mapas al crear incidencias
3. **Rutas de Inspección**: Levantar múltiples incidencias en una sola sesión
4. **Versionado de Mapas**: Mantener historial de mapas por ubicación
5. **Exportación PDF**: Generar informes con mapas y marcadores numerados

---

## 🏗️ Arquitectura Propuesta

### Nuevos Tipos TypeScript

```typescript
// Ubicación física (lugar)
interface MapLocation {
  id: string
  nombre: string           // "Planta Principal", "Recinto Empresa", "Acopio"
  descripcion?: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

// Versión de mapa para una ubicación
interface MapVersion {
  id: string
  locationId: string       // Referencia a MapLocation
  imageUrl: string         // URL del mapa en Firebase Storage
  imagePath: string        // Path en Storage para eliminar
  version: number          // 1, 2, 3... auto-incrementado
  descripcion?: string     // "Actualización después de remodelación"
  width: number            // Dimensiones originales
  height: number
  uploadedBy: string       // userId del admin
  createdAt: Date
}

// Marcador en mapa (asociado a incidencia o inspección)
interface MapMarker {
  id: string
  mapVersionId: string     // A qué versión del mapa pertenece
  locationId: string       // Redundante pero útil para queries
  incidentId?: string      // Si es incidencia individual
  inspectionId?: string    // Si es parte de una ruta
  inspectionIndex?: number // Orden en la ruta (1, 2, 3...)
  position: {
    x: number              // 0-1 normalizado
    y: number              // 0-1 normalizado
  }
  createdAt: Date
  createdBy: string
}

// Ruta de inspección
interface Inspection {
  id: string
  nombre: string           // "Inspección suelos rotos - Planta Principal"
  descripcion?: string
  locationId: string       // Ubicación donde se realiza
  mapVersionId: string     // Versión del mapa usada
  status: 'en_progreso' | 'completada' | 'cancelada'
  totalMarkers: number     // Contador de marcadores
  createdBy: string
  createdAt: Date
  completedAt?: Date
}

// Extender Incident existente
interface Incident {
  // ... campos existentes ...
  
  // NUEVOS CAMPOS
  mapMarkerId?: string     // Referencia al marcador en mapa
  mapLocationId?: string   // Ubicación del mapa
  inspectionId?: string    // Si pertenece a una ruta
}
```

### Estructura Firestore

```
/mapLocations/{locationId}
  - nombre: string
  - descripcion: string
  - activo: boolean
  - createdAt: timestamp
  - updatedAt: timestamp

/mapVersions/{versionId}
  - locationId: string
  - imageUrl: string
  - imagePath: string
  - version: number
  - width: number
  - height: number
  - uploadedBy: string
  - createdAt: timestamp

/mapMarkers/{markerId}
  - mapVersionId: string
  - locationId: string
  - incidentId: string (optional)
  - inspectionId: string (optional)
  - inspectionIndex: number (optional)
  - position: { x: number, y: number }
  - createdAt: timestamp
  - createdBy: string

/inspections/{inspectionId}
  - nombre: string
  - descripcion: string
  - locationId: string
  - mapVersionId: string
  - status: string
  - totalMarkers: number
  - createdBy: string
  - createdAt: timestamp
  - completedAt: timestamp (optional)
```

---

## 📦 Fases de Implementación

### Fase 1: Tipos y Servicios Base ⏱️ ~1h ✅ COMPLETADA
- [x] Crear tipos en `types/maps.ts`
- [x] Crear servicios CRUD en `services/maps.ts`
- [x] Configurar reglas Firestore

### Fase 2: Gestión de Mapas (Admin) ⏱️ ~2h ✅ COMPLETADA
- [x] Página de administración de ubicaciones (`/admin/maps`)
- [x] Formulario crear/editar ubicación
- [x] Subida de imágenes de mapa
- [x] Lista de versiones de mapa por ubicación
- [x] Preview de mapas

### Fase 3: Componente de Mapa Interactivo ⏱️ ~2h ✅ COMPLETADA
- [x] Componente `MapViewer` base
- [x] Click para colocar marcador
- [x] Drag para mover marcador (zoom/pan)
- [x] Zoom/pan básico
- [x] Renderizar marcadores existentes

### Fase 4: Integración con Incidencias ⏱️ ~2h ✅ COMPLETADA
- [x] Modal selector de ubicación/mapa
- [x] Flujo: Seleccionar mapa → Colocar marcador → Confirmar → Formulario
- [x] Campos mapLocationId, mapVersionId, mapPosition en Incident
- [x] Mostrar marcador en detalle de incidencia
- [ ] Filtrar incidencias por mapa/ubicación

### Fase 5: Rutas de Inspección ⏱️ ~3h ✅ COMPLETADA
- [x] Página crear inspección (`/inspections`)
- [x] Modo "multi-marcador"
- [x] Mini-formulario por marcador (título + descripción)
- [x] Lista de puntos levantados
- [x] Finalizar inspección

### Fase 6: Visualización y Filtros ⏱️ ~1.5h ✅ COMPLETADA
- [x] Vista de mapa con todos los marcadores (`/map-view`)
- [x] Filtrar por fecha
- [x] Filtrar por inspección
- [x] Popup con info del marcador
- [x] Botón de exportación PDF

### Fase 7: Exportación PDF ⏱️ ~2h ✅ COMPLETADA
- [x] Generar PDF con mapa y marcadores numerados
- [x] Tabla de incidencias con número correspondiente
- [x] Fotos asociadas (opcional)
- [x] Estadísticas de la inspección

---

## 🎨 Wireframes de UI

### Flujo Crear Incidencia con Mapa

```
┌─────────────────────────────────────────────────────┐
│  Nueva Incidencia                              [X]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📍 Seleccionar Ubicación                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ [Planta Principal] [Recinto] [Acopio] [+]   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Toca el mapa para colocar el marcador:            │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │           [IMAGEN DEL MAPA]                 │   │
│  │                  📍                         │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Modificar Posición]        [✓ Confirmar]         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Flujo Ruta de Inspección

```
┌─────────────────────────────────────────────────────┐
│  🔍 Nueva Ruta de Inspección                   [X]  │
├─────────────────────────────────────────────────────┤
│  Nombre: [Inspección suelos - Planta Principal    ] │
│  Ubicación: [Planta Principal ▾]                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │     [MAPA CON MARCADORES NUMERADOS]         │   │
│  │         ①  ②     ④                         │   │
│  │              ③        ⑤                     │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Puntos Levantados: 5                              │
│  ┌─────────────────────────────────────────────┐   │
│  │ ① Grieta en piso - 2 fotos          [ver]   │   │
│  │ ② Baldosa suelta - 1 foto           [ver]   │   │
│  │ ③ Hundimiento - 3 fotos             [ver]   │   │
│  │ ...                                         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [+ Agregar Punto]     [Finalizar Inspección]      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔒 Reglas de Seguridad Firestore

```javascript
// mapLocations - Solo admin puede crear/editar
match /mapLocations/{locationId} {
  allow read: if request.auth != null;
  allow write: if isAdmin();
}

// mapVersions - Solo admin puede subir mapas
match /mapVersions/{versionId} {
  allow read: if request.auth != null;
  allow create: if isAdmin();
  allow update, delete: if isAdmin();
}

// mapMarkers - Usuarios autenticados pueden crear
match /mapMarkers/{markerId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if isAdmin() || isOwner(resource.data.createdBy);
}

// inspections - Usuarios autenticados pueden crear
match /inspections/{inspectionId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if isAdmin() || isOwner(resource.data.createdBy);
  allow delete: if isAdmin();
}
```

---

## 📊 Dependencias Técnicas

### Librerías Existentes a Usar
- `jspdf` - Ya instalada para exportación PDF
- `firebase/storage` - Ya configurado
- Componentes UI existentes (Dialog, Button, etc.)

### Sin Nuevas Dependencias
- El mapa se renderiza como imagen con overlay SVG/Canvas para marcadores
- No requiere librerías de mapas externas (Leaflet, etc.)

---

## ✅ Criterios de Éxito

1. **Admin puede**: Crear ubicaciones, subir mapas, ver historial de versiones
2. **Usuario puede**: Crear incidencia con marcador en mapa
3. **Usuario puede**: Crear ruta de inspección con múltiples puntos
4. **Sistema muestra**: Marcadores en su mapa correspondiente (versionado)
5. **Exportación**: PDF con mapa numerado y fotos organizadas
6. **Performance**: Carga rápida de mapas (compresión de imágenes)

---

## 📝 Notas de Implementación

### Versionado de Mapas
- Al subir nuevo mapa para ubicación existente: `version++`
- Marcadores nuevos → último `mapVersionId`
- Marcadores antiguos → su `mapVersionId` original
- Vista histórica: filtrar por fecha muestra mapa de esa época

### Normalización de Coordenadas
- Posición `{x, y}` siempre entre 0 y 1
- Multiplicar por dimensiones actuales del contenedor al renderizar
- Permite que mapas de diferente tamaño mantengan marcadores consistentes

### Compresión de Imágenes de Mapa
- Usar `compressImage()` existente
- Target: max 2000px lado largo, 80% quality
- Formato WebP si soportado

---

## 🚀 Próximos Pasos Inmediatos

1. Crear `types/maps.ts` con interfaces
2. Crear `services/maps.ts` con CRUD
3. Actualizar reglas Firestore
4. Crear página admin de mapas
5. Crear componente MapViewer
6. Integrar en formulario de incidencias

---

**Autor**: Copilot  
**Revisado**: Pendiente  
**Aprobado**: Pendiente
