# 📋 Guía de Debugging - Sistema de Jerarquías

## v1.1.0 - Logs Extensivos Habilitados

### ✅ Correcciones Aplicadas

1. **Campo `creadoPor` duplicado** ❌ → ✅
   - **Problema**: HierarchyPage enviaba `creadoPor: user.id`, pero el hook ya lo agrega con `user.uid`
   - **Solución**: Eliminado del objeto `nodeData` en HierarchyPage
   - **Archivo**: `apps/pwa/src/pages/HierarchyPage.tsx` línea 165-175

2. **Campos `undefined` en Firestore** ❌ → ✅
   - **Problema**: Firestore rechaza valores `undefined`
   - **Solución**: Solo agregamos campos opcionales si tienen valor
   - **Implementación**: Validación con `?.trim()` antes de agregar

### 🔍 Logs Agregados en Consola

#### **1. HierarchyPage - Creación de Nodos**
```javascript
console.log('[HierarchyPage] Creando nodo:', {
  nombre, codigo, nivel, parentId, userId
})
console.log('[HierarchyPage] Nodo creado exitosamente:', newId)
```

#### **2. useHierarchy - Hook createNode**
```javascript
console.log('[useHierarchy] createNode iniciado:', input)
console.log('[useHierarchy] Usuario actual:', { uid, id })
console.log('[useHierarchy] Obteniendo padre:', parentId)
console.log('[useHierarchy] Path calculado:', path)
console.log('[useHierarchy] Consultando hermanos para calcular orden...')
console.log('[useHierarchy] Hermanos encontrados:', count, 'Orden siguiente:', orden)
console.log('[useHierarchy] Guardando nodo en Firestore:', newNode)
console.log('[useHierarchy] Nodo guardado con ID:', docRefId)
console.error('[useHierarchy] Error al crear nodo:', error)
console.error('[useHierarchy] Detalles del error:', { name, code, message, stack })
```

#### **3. useHierarchyChildren - Carga de Hijos**
```javascript
console.log('[useHierarchyChildren] Cargando hijos:', { parentId, nivel })
console.log('[useHierarchyChildren] Query constraints:', constraints)
console.log('[useHierarchyChildren] Documentos encontrados:', size)
console.log('[useHierarchyChildren] Nodos procesados:', count)
console.error('[useHierarchyChildren] Error:', error)
```

---

## 📝 Cómo Usar los Logs para Debugging

### **Escenario 1: Error al Crear Nodo**

1. **Abrir DevTools**: Presiona `F12`
2. **Ir a pestaña Console**
3. **Intentar crear nodo** en la página de Jerarquías
4. **Buscar logs**:
   ```
   [HierarchyPage] Creando nodo: ...
   [useHierarchy] createNode iniciado: ...
   [useHierarchy] Usuario actual: ...
   ```

5. **Identificar el error**:
   - Si dice `"Usuario no autenticado"` → Revisar que `user.uid` exista
   - Si dice `"Unsupported field value: undefined"` → Campo con `undefined`
   - Si dice `"The query requires an index"` → Falta índice en Firestore
   - Si dice `"Missing or insufficient permissions"` → Problema en reglas

### **Escenario 2: Selector de Jerarquía No Carga Opciones**

1. **Abrir DevTools** (F12) → Console
2. **Abrir formulario de incidencia**
3. **Buscar logs**:
   ```
   [useHierarchyChildren] Cargando hijos: { parentId: null, nivel: 1 }
   [useHierarchyChildren] Documentos encontrados: 10
   ```

4. **Diagnosticar**:
   - **0 documentos** → No hay nodos inicializados
   - **Error de índice** → Esperar construcción de índices (5-10 min)
   - **Error de permisos** → Revisar reglas Firestore

### **Escenario 3: Path/Breadcrumb No Se Muestra**

1. Buscar logs de `useHierarchyPath`
2. Verificar que el `nodeId` existe en Firestore
3. Revisar que el campo `path` del nodo sea un array válido

---

## 🛠️ Comandos Útiles para Debugging

### **Ver logs filtrados en consola**:
```javascript
// En DevTools Console, ejecutar:
localStorage.setItem('debug', 'hierarchy:*')

// O solo ver errores:
console.log = () => {} // Silenciar logs normales
```

### **Verificar usuario autenticado**:
```javascript
// En Console:
useAuthStore.getState().user
```

### **Revisar estado de jerarquía**:
```javascript
// En Console, ejecutar queries manuales:
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const snapshot = await getDocs(collection(db, 'hierarchy'))
console.log('Total nodos:', snapshot.size)
snapshot.forEach(doc => console.log(doc.id, doc.data()))
```

---

## 🔧 Checklist de Troubleshooting

### **Antes de reportar un error**:

- [ ] Abriste DevTools (F12) → Console
- [ ] Intentaste reproducir el error
- [ ] Copiaste los logs completos (incluyendo stack trace)
- [ ] Verificaste que los índices de Firestore estén construidos
- [ ] Revisaste que tu usuario tenga rol `admin` en Firestore
- [ ] Refrescaste la página (Ctrl+F5) para limpiar caché

### **Información a incluir en reporte**:

1. **Screenshot de la consola** con logs visibles
2. **Pasos exactos** para reproducir
3. **Usuario** que intenta la acción
4. **Hora** del error (para revisar logs de Firebase)

---

## 📊 Índices de Firestore Requeridos

### **Estado actual** (v1.0.8+):
```json
{
  "hierarchy": [
    ["parentId", "activo", "orden"] // ASC, ASC, ASC
    ["parentId", "orden"] // ASC, DESC - Para createNode
    ["nivel", "parentId", "activo", "orden"] // ASC, ASC, ASC, ASC
    ["activo", "nivel", "orden"] // ASC, ASC, ASC
  ]
}
```

### **Verificar construcción**:
1. Firebase Console → Firestore → Indexes
2. Buscar "hierarchy"
3. Estado debe ser **"Enabled"** (verde)
4. Si dice **"Building"** (amarillo) → Esperar 5-10 minutos

---

## 🐛 Errores Conocidos y Soluciones

### **Error: "The query requires an index"**
- **Causa**: Índice faltante o en construcción
- **Solución**: Esperar construcción o desplegar:
  ```bash
  firebase deploy --only firestore:indexes
  ```

### **Error: "Unsupported field value: undefined"**
- **Causa**: Campo con `undefined` en vez de omitido
- **Solución**: Ya corregido en v1.0.9+

### **Error: "Missing or insufficient permissions"**
- **Causa**: Reglas de Firestore o usuario sin permisos
- **Solución**: Verificar `rol: 'admin'` en Firestore users/{uid}

### **Selector no muestra opciones**
- **Causa 1**: No hay nodos inicializados
  - **Solución**: Ir a Configuración → Inicializar Sistema
- **Causa 2**: Error de índices
  - **Solución**: Ver logs en consola y esperar construcción

---

## 📚 Recursos

- **Firestore Console**: https://console.firebase.google.com/project/mantenimiento-planta-771a3/firestore
- **Logs de App**: DevTools (F12) → Console
- **GitHub Repo**: https://github.com/orelcain/mantenimiento-planta

---

**Última actualización**: 25 de diciembre de 2025 - v1.1.0
