# Guía de Inicialización del Sistema de Jerarquía

## v1.1.4 - Nueva funcionalidad de auto-inicialización

### ¿Qué cambió?

Ahora, cuando vayas a crear una incidencia y el selector de ubicación esté vacío, verás un **botón de inicialización automática**.

### ¿Por qué necesito inicializar?

El sistema de jerarquía de 8 niveles requiere al menos un nodo **EMPRESA** (nivel 1) como raíz. Si creaste áreas manualmente sin crear primero la empresa, el selector no podrá mostrar opciones.

### Cómo usar la inicialización

#### Opción 1: Desde el formulario de incidencia (NUEVO ✨)

1. Ve a **Crear Incidencia**
2. Si el selector de ubicación muestra el mensaje:
   ```
   ⚠️ Sistema sin inicializar: No hay estructura de jerarquía creada...
   ```
3. Haz clic en el botón **"Inicializar Sistema"**
4. Espera unos segundos mientras se crean las áreas base
5. La página se recargará automáticamente y verás las opciones

#### Opción 2: Manualmente desde Jerarquías

1. Ve a **Jerarquías** en el menú
2. Crea primero un nodo de tipo **EMPRESA** (nivel 1)
   - Nombre: Por ejemplo "Aquachile Chonchi"
   - Código: Por ejemplo "aquachile-chonchi"
   - Nivel: **1 - EMPRESA**
   - Parent: **Ninguno** (es la raíz)
3. Luego crea **AREAS** (nivel 2) bajo esa empresa
4. Finalmente crea **SUB-AREAS** (nivel 3) bajo las áreas

### ¿Qué crea la inicialización automática?

El botón crea la siguiente estructura base:

```
📍 Aquachile Antarfood Chonchi (EMPRESA - Nivel 1)
    ├── 🏭 Producción (AREA - Nivel 2)
    │   ├── Línea de Filete (SUB-AREA - Nivel 3)
    │   ├── Línea de Eviscerado (SUB-AREA - Nivel 3)
    │   ├── Línea de Empaque (SUB-AREA - Nivel 3)
    │   └── Zona de Recepción (SUB-AREA - Nivel 3)
    │
    ├── 📦 Almacenamiento (AREA - Nivel 2)
    │   └── Cámara Frigorífica Principal (SUB-AREA - Nivel 3)
    │
    ├── 🔧 Mantenimiento (AREA - Nivel 2)
    │
    └── ✅ Calidad (AREA - Nivel 2)
```

### Niveles del sistema

1. **EMPRESA** - Raíz del sistema (nivel 1)
2. **AREA** - Grandes divisiones (nivel 2)
3. **SUB-AREA** - Subdivisiones (nivel 3) ⭐ Mínimo para incidencias
4. **SISTEMA** - Sistemas específicos (nivel 4)
5. **SUB-SISTEMA** - Partes de sistemas (nivel 5)
6. **SECCION** - Secciones (nivel 6)
7. **SUB-SECCION** - Subsecciones (nivel 7)
8. **ELEMENTO** - Elementos individuales (nivel 8)

### Solución de problemas

#### ❌ El botón no aparece
- **Causa**: Ya hay nodos de nivel 1 creados
- **Solución**: Verifica en Jerarquías si existe un nodo EMPRESA

#### ❌ Error al inicializar
- **Causa**: Problema de permisos o conexión
- **Solución**: 
  1. Verifica que estés logueado como **admin**
  2. Revisa la consola del navegador (F12)
  3. Contacta soporte si persiste

#### ❌ Después de inicializar sigue vacío
- **Causa**: La página no se recargó
- **Solución**: Recarga manualmente (F5)

### Logs de debug

En la consola del navegador (F12) verás:
```
[HierarchySelector] Inicializando sistema de jerarquía...
[HierarchySelector] Sistema inicializado correctamente
```

### Próximos pasos después de inicializar

1. ✅ Verifica que el selector ahora muestre opciones
2. ✅ Personaliza las áreas según tu planta
3. ✅ Agrega más niveles según necesites (hasta nivel 8)
4. ✅ Crea incidencias con ubicaciones específicas

---

**Versión**: 1.1.4  
**Fecha**: ${new Date().toLocaleDateString('es-CL')}
