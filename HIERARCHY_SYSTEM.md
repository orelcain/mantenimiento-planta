# 🏢 Sistema de Jerarquías Anidadas - v1.0.5

## 📋 Descripción General

Sistema jerárquico de **8 niveles** para ubicación y clasificación de incidencias en la planta de Aquachile Antarfood Chonchi. Reemplaza el sistema anterior basado en zonas geográficas del mapa con una estructura organizacional más flexible y escalable.

## 🎯 Estructura Jerárquica

```
Nivel 1: Empresa (raíz)
   └── Nivel 2: Área
         └── Nivel 3: Sub-área ⚠️ MÍNIMO REQUERIDO PARA INCIDENCIAS
              └── Nivel 4: Sistema
                   └── Nivel 5: Sub-sistema
                        └── Nivel 6: Sección
                             └── Nivel 7: Sub-sección
                                  └── Nivel 8: Elemento (detalle contextual)
```

### Ejemplo Real:
```
Aquachile Antarfood Chonchi (Empresa)
├── Producción (Área)
│   ├── Proceso (Sub-área)
│   ├── Empaque (Sub-área)
│   └── Congelación (Sub-área) ✓ VÁLIDO PARA INCIDENCIAS
│       ├── Sistema de Refrigeración (Sistema)
│       │   ├── Compresor Principal (Sub-sistema)
│       │   │   ├── Motor Eléctrico (Sección)
│       │   │   │   └── Rodamiento Frontal (Elemento)
│       └── Sistema Eléctrico (Sistema)
├── Almacenamiento y Logística (Área)
├── Mantenimiento (Área)
└── Control de Calidad (Área)
```

## ✨ Características Principales

### 1. **Selector en Cascada**
- ✅ 8 niveles de selección dinámica
- ✅ Carga automática de opciones por nivel
- ✅ Breadcrumb visual del path seleccionado
- ✅ Validación de nivel mínimo (Nivel 3)
- ✅ Indicadores de completitud

### 2. **Gestión Optimizada**
- ✅ Caché en memoria (5 minutos TTL)
- ✅ Queries eficientes con índices
- ✅ Código único auto-generado (XXX-NNN)
- ✅ Path completo almacenado para consultas rápidas

### 3. **Compatibilidad**
- ✅ Campo `zoneId` mantenido para retrocompatibilidad
- ✅ Nuevo campo `hierarchyNodeId` para nuevas incidencias
- ✅ Migración progresiva sin pérdida de datos

## 🚀 Uso

### Crear Incidencia con Ubicación Jerárquica

```typescript
import { HierarchySelector } from '@/components/hierarchy'

function IncidentForm() {
  const [location, setLocation] = useState<string | null>(null)

  return (
    <HierarchySelector
      value={location}
      onChange={setLocation}
      minLevel={HierarchyLevel.SUB_AREA} // Mínimo nivel 3
    />
  )
}
```

### Mostrar Breadcrumb de Ubicación

```typescript
import { HierarchyBreadcrumb } from '@/components/hierarchy'

function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <div>
      <h3>{incident.titulo}</h3>
      <HierarchyBreadcrumb nodeId={incident.hierarchyNodeId} />
    </div>
  )
}
```

### Consultar Nodos

```typescript
import { useHierarchyTree, useHierarchyChildren } from '@/hooks/useHierarchy'

// Obtener árbol completo
const { tree, loading, refresh } = useHierarchyTree()

// Obtener hijos de un nodo
const { children } = useHierarchyChildren(parentId, nivel)
```

## 📊 Modelo de Datos

### HierarchyNode (Firestore)

```typescript
{
  id: string                // ID único del documento
  nombre: string            // "Compresor Principal"
  codigo: string            // "PROD-001-CON-SRF-CMP"
  nivel: 1-8                // Nivel jerárquico
  parentId: string | null   // ID del padre (null para nivel 1)
  path: string[]            // ["empresa-id", "area-id", "subarea-id"]
  orden: number             // Orden entre hermanos
  activo: boolean           // Estado del nodo
  descripcion?: string      // Descripción opcional
  metadata?: object         // Datos adicionales
  creadoPor: string         // UID del usuario
  creadoEn: Timestamp       // Fecha de creación
  actualizadoEn: Timestamp  // Última actualización
}
```

## 🔐 Reglas de Seguridad

```javascript
// Solo supervisores pueden crear/editar jerarquías
allow create, update: if isSupervisor()
  && isValidHierarchyLevel(request.resource.data.nivel)
  && isValidHierarchyCode(request.resource.data.codigo)

// Todos los usuarios pueden leer
allow read: if isAuthenticated()

// Solo admins pueden eliminar
allow delete: if isAdmin()
```

## 🛠️ Inicialización del Sistema

```typescript
import { initializeHierarchySystem } from '@/services/hierarchyInit'

// Ejecutar una sola vez al configurar la planta
await initializeHierarchySystem(adminUserId)
```

Esto crea:
- ✅ Empresa raíz: Aquachile Antarfood Chonchi
- ✅ 4 áreas principales (Producción, Almacenamiento, Mantenimiento, Calidad)
- ✅ 3 sub-áreas en Producción
- ✅ 2 sistemas de ejemplo

## 📈 Beneficios vs Sistema Anterior (Zonas)

| Aspecto | Sistema Zonas | Sistema Jerárquico |
|---------|---------------|-------------------|
| Independencia del mapa | ❌ Requiere mapa | ✅ Funciona sin mapa |
| Niveles de detalle | 1 nivel | 8 niveles anidados |
| Clasificación | Geográfica | Organizacional |
| Escalabilidad | Limitada | Infinita |
| Filtros | Básicos | Multi-nivel |
| Reportes | Por zona | Por área/sistema/elemento |
| Mantenimiento | Dibujar zonas | CRUD simple |

## 🔄 Migración de Datos

El sistema mantiene compatibilidad con `zoneId` existentes:

```typescript
// Incidencias antiguas
{
  zoneId: "zona-produccion-1",  // ✅ Mantiene funcionalidad
  hierarchyNodeId: null
}

// Incidencias nuevas
{
  zoneId: null,
  hierarchyNodeId: "subarea-prod-congelacion"  // ✅ Nuevo sistema
}
```

## 🎨 Componentes UI

### HierarchySelector
Selector en cascada con validación visual

### HierarchyBreadcrumb
Breadcrumb compacto para mostrar ubicación

### LevelSelector (interno)
Selector individual por cada nivel

## 📝 Validaciones

- ✅ Nombre: 3-100 caracteres
- ✅ Código: Formato `XXX-NNN` (5-20 caracteres)
- ✅ Nivel: 1-8 válido
- ✅ Path: Máximo 8 niveles
- ✅ Incidencias: Mínimo nivel 3 (Sub-área)

## 🐛 Troubleshooting

### No aparecen opciones en selector
```typescript
// Verificar que existan nodos en Firestore
const { nodes } = useHierarchySearch({ nivel: HierarchyLevel.AREA })
console.log('Areas disponibles:', nodes)
```

### Caché desactualizado
```typescript
// Forzar refresh del árbol
const { refresh } = useHierarchyTree()
refresh()
```

### Validación falla en nivel 3
```typescript
// Verificar que se seleccionó hasta sub-área mínimo
const MIN_LEVEL = HIERARCHY_CONSTRAINTS.MIN_REQUIRED_LEVEL_FOR_INCIDENT // = 3
```

## 🚦 Próximos Pasos

1. ✅ Implementar vista de administración de jerarquías (árbol interactivo)
2. ✅ Agregar búsqueda y filtros avanzados
3. ✅ Exportar/importar estructura desde CSV/Excel
4. ✅ Reportes y estadísticas por nivel
5. ✅ Integración con sistema de equipos

## 📚 Referencias

- **Código fuente**: `src/types/hierarchy.ts`
- **Hooks**: `src/hooks/useHierarchy.ts`
- **Componentes**: `src/components/hierarchy/`
- **Reglas Firestore**: `firestore.rules`

---

**Versión**: 1.0.5  
**Fecha**: 25 de diciembre de 2025  
**Autor**: Sistema de Mantenimiento Aquachile
