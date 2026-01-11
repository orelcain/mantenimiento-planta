# Sistema de Estructura Base y Expansiones

## 📋 Descripción General

Sistema para diferenciar visualmente la estructura organizacional base (original) de las expansiones futuras agregadas al sistema. Permite auditoría temporal del crecimiento y seguimiento de cambios estructurales.

## 🎯 Características

### 1. Distintivos Visuales

#### Badge "Base" (Azul)
- **Icono**: Clock ⏰
- **Color**: Azul (`border-blue-300 text-blue-700 bg-blue-50`)
- **Indica**: Nodo pertenece a la estructura organizacional original
- **Tooltip**: Muestra fecha común de estructura base

#### Badge "Nuevo" (Verde)
- **Icono**: Sparkles ✨
- **Color**: Verde (`bg-green-500 hover:bg-green-600`)
- **Indica**: Nodo agregado como expansión después de la migración
- **Tooltip**: Muestra fecha exacta de creación del nodo

### 2. Campos en Base de Datos

```typescript
interface HierarchyNode {
  // ... campos existentes
  
  // Nuevos campos
  isBaseStructure?: boolean;      // true = estructura base, false = expansión
  baseStructureDate?: Timestamp;  // fecha común para todos los nodos base
}
```

#### `isBaseStructure`
- **Tipo**: `boolean | undefined`
- **Valores**:
  - `true`: Nodo de estructura base original
  - `false`: Nodo agregado como expansión
  - `undefined`: Nodos legacy sin clasificar (tratados como base)

#### `baseStructureDate`
- **Tipo**: `Timestamp | undefined`
- **Propósito**: Fecha común que marca cuándo se estableció la estructura base
- **Solo presente en**: Nodos con `isBaseStructure: true`

## 🔧 Implementación Técnica

### Archivos Modificados

1. **apps/pwa/src/types/hierarchy.ts**
   - Agregados campos `isBaseStructure` y `baseStructureDate` a interface `HierarchyNode`

2. **apps/pwa/src/pages/HierarchyPage.tsx**
   - Imports: `Sparkles`, `Clock` de lucide-react
   - Badge condicional después de badge de equipos (línea ~765)
   - Lógica de renderizado según `isBaseStructure`
   - Tooltips con fechas formateadas

3. **apps/pwa/src/hooks/useHierarchy.ts**
   - Función `createNode` modificada
   - Nuevos nodos establecen `isBaseStructure: false`
   - No se establece `baseStructureDate` en expansiones

### Lógica de Renderizado

```tsx
{/* Badge estructura base vs expansión */}
{node.isBaseStructure ? (
  <Badge 
    variant="outline" 
    className="text-xs flex items-center gap-1 border-blue-300 text-blue-700 bg-blue-50"
    title={`Estructura base - ${node.baseStructureDate ? new Date(node.baseStructureDate.toDate()).toLocaleDateString() : 'Fecha no disponible'}`}
  >
    <Clock className="h-2.5 w-2.5" />
    Base
  </Badge>
) : node.creadoEn && (
  <Badge 
    variant="default" 
    className="text-xs flex items-center gap-1 bg-green-500 hover:bg-green-600"
    title={`Expansión agregada - ${new Date(node.creadoEn.toDate()).toLocaleDateString()}`}
  >
    <Sparkles className="h-2.5 w-2.5" />
    Nuevo
  </Badge>
)}
```

### Lógica de Creación

```typescript
const newNode: any = {
  nombre: input.nombre,
  codigo: input.codigo,
  nivel: input.nivel,
  parentId: input.parentId,
  path,
  orden: lastOrder + 1,
  activo: true,
  isBaseStructure: false, // Los nuevos nodos son expansiones
  creadoPor: user.id,
  creadoEn: Timestamp.now(),
  actualizadoEn: Timestamp.now(),
}
```

## 🚀 Script de Migración

### Archivo
`scripts/mark_base_hierarchy.js`

### Propósito
Marca todos los nodos existentes al momento de la implementación como estructura base con fecha común.

### Uso

```bash
# Dry run (sin escribir a Firestore)
node scripts/mark_base_hierarchy.js --dry-run

# Ejecución real
node scripts/mark_base_hierarchy.js
```

### Funcionalidad

1. **Inicialización**
   - Carga Firebase Admin SDK
   - Se conecta a Firestore

2. **Procesamiento**
   - Query de todos los documentos en colección `hierarchy`
   - Fecha común: `Timestamp.now()` al momento de ejecución
   - Batch updates de 500 documentos a la vez

3. **Campos establecidos**
   ```javascript
   {
     isBaseStructure: true,
     baseStructureDate: baseDate
   }
   ```

4. **Skip de duplicados**
   - No actualiza nodos que ya tienen `isBaseStructure: true`
   - Útil si el script se ejecuta múltiples veces

5. **Logging**
   - Progreso cada 10 nodos
   - Resumen final: total, actualizados, omitidos

### Resultado de Migración
- **Fecha**: 10 de enero de 2026
- **Nodos procesados**: 862
- **Nodos actualizados**: 862
- **Nodos omitidos**: 0
- **Estado**: ✅ Completado exitosamente

## 📊 Datos Actuales

### Estructura Base
- **Cantidad**: 862 nodos
- **Fecha común**: 2026-01-10T23:53:00.765Z
- **Incluye**: Toda la jerarquía existente al momento de la implementación
- **Niveles**: Desde raíces hasta nivel 9

### Expansiones Futuras
- **Cantidad actual**: 0 (sistema recién implementado)
- **Identificación**: Badge verde "Nuevo" con Sparkles
- **Fecha individual**: Cada nodo guarda su `creadoEn`

## 🎨 Diseño de UI

### Colores y Estilos

#### Badge Base
```css
border-blue-300      /* Borde azul claro */
text-blue-700        /* Texto azul oscuro */
bg-blue-50           /* Fondo azul muy claro */
```

#### Badge Nuevo
```css
bg-green-500         /* Fondo verde */
hover:bg-green-600   /* Hover verde oscuro */
text-white           /* Texto blanco (por defecto del Badge) */
```

### Iconos
- **Clock**: Representa tiempo/historia (estructura base)
- **Sparkles**: Representa novedad/brillo (expansiones)
- **Tamaño**: `h-2.5 w-2.5` (pequeños para badges compactos)

## 📝 Casos de Uso

### Usuario Final

1. **Visualización rápida**: Identificar de un vistazo qué partes de la organización son originales vs agregadas

2. **Auditoría temporal**: Entender cómo ha crecido la estructura organizacional

3. **Planificación**: Identificar áreas de expansión reciente para análisis

### Administrador

1. **Seguimiento de crecimiento**: Monitorear expansión organizacional por fecha

2. **Reporte de cambios**: Documentar evolución de la estructura

3. **Validación**: Verificar que nuevos nodos se marquen correctamente

## 🔒 Consideraciones de Seguridad

### Firestore Rules
No requiere reglas especiales. Los campos `isBaseStructure` y `baseStructureDate` siguen las mismas reglas que otros campos del nodo:

```javascript
// Usuarios autenticados pueden leer
allow read: if request.auth != null;

// Solo admins pueden escribir
allow create, update: if isAdmin(request.auth.uid);
```

### Script de Migración
- Requiere credentials de Firebase Admin
- Ejecutar solo por desarrolladores/admins autorizados
- Modo dry-run recomendado antes de aplicar cambios

## 🧪 Testing

### Verificación Manual

1. **Estructura base**:
   - Navegar a HierarchyPage
   - Verificar badges azules "Base" en nodos existentes
   - Hover sobre badge para ver fecha común

2. **Expansiones**:
   - Crear nuevo nodo desde HierarchyAdminPage
   - Verificar badge verde "Nuevo" aparece
   - Hover para ver fecha de creación individual

3. **Tooltips**:
   - Verificar formato de fecha legible
   - Confirmar fechas correctas (base vs nueva)

### Verificación Programática

```typescript
// En consola del navegador
const nodes = await firebase.firestore().collection('hierarchy').get();
const baseCount = nodes.docs.filter(d => d.data().isBaseStructure === true).length;
const expansionCount = nodes.docs.filter(d => d.data().isBaseStructure === false).length;
console.log(`Base: ${baseCount}, Expansiones: ${expansionCount}`);
```

## 📈 Métricas y Analytics

### KPIs Sugeridos

1. **Tasa de expansión**: Nuevos nodos por mes
2. **Distribución**: % base vs % expansiones
3. **Áreas de crecimiento**: Qué ramas crecen más rápido
4. **Velocidad de adopción**: Tiempo entre nodos nuevos

### Queries Útiles

```typescript
// Contar expansiones por mes
const expansions = await getDocs(
  query(
    collection(db, 'hierarchy'),
    where('isBaseStructure', '==', false),
    orderBy('creadoEn', 'desc')
  )
);

// Agrupar por mes
const byMonth = expansions.docs.reduce((acc, doc) => {
  const date = doc.data().creadoEn.toDate();
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  acc[month] = (acc[month] || 0) + 1;
  return acc;
}, {});
```

## 🔄 Mantenimiento Futuro

### Actualización de Fecha Base
Si se necesita remarcar la estructura base en el futuro:

```bash
# Ejecutar script nuevamente (skip nodos ya marcados)
node scripts/mark_base_hierarchy.js

# O modificar script para forzar actualización de fecha
```

### Reclasificación
Para mover nodo de expansión a base (poco común):

```typescript
await updateDoc(doc(db, 'hierarchy', nodeId), {
  isBaseStructure: true,
  baseStructureDate: baseStructureTimestamp
});
```

## 📚 Referencias

- **Tipo**: [hierarchy.ts](../../apps/pwa/src/types/hierarchy.ts)
- **UI**: [HierarchyPage.tsx](../../apps/pwa/src/pages/HierarchyPage.tsx)
- **Hook**: [useHierarchy.ts](../../apps/pwa/src/hooks/useHierarchy.ts)
- **Script**: [mark_base_hierarchy.js](../../scripts/mark_base_hierarchy.js)
- **Versión**: [VERSION.md](../../VERSION.md)

## ✅ Checklist de Implementación

- [x] Actualizar tipo `HierarchyNode` con campos nuevos
- [x] Crear script de migración `mark_base_hierarchy.js`
- [x] Ejecutar migración en 862 nodos existentes
- [x] Agregar badges visuales en HierarchyPage
- [x] Actualizar `createNode` para marcar expansiones
- [x] Agregar imports Sparkles y Clock
- [x] Implementar tooltips con fechas
- [x] Actualizar versión a 2.6.0
- [x] Documentar en VERSION.md
- [x] Crear documentación técnica (este archivo)
- [x] Verificar build sin errores
- [ ] Testing manual completo
- [ ] Deploy a producción

---

**Versión del documento**: 1.0  
**Última actualización**: 10 de enero de 2026  
**Autor**: GitHub Copilot
