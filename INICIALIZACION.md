# Sistema de Jerarquía - Inicialización Automática

## v1.1.5 - Inicialización automática simplificada ✨

### ¿Qué cambió?

El sistema ahora se **inicializa automáticamente** cuando detecta que no hay estructura creada. **No necesitas hacer nada**, solo espera unos segundos la primera vez que intentes crear una incidencia.

### ¿Cómo funciona?

1. Abre el formulario de **Crear Incidencia**
2. Si no hay jerarquía creada, verás brevemente:
   ```
   🔄 Inicializando sistema...
   ```
3. La página se recargará automáticamente
4. ¡Listo! Ahora verás las opciones de ubicación disponibles

### ¿Qué se crea automáticamente?

El sistema crea esta estructura base:

```
📍 Aquachile Antarfood Chonchi (EMPRESA - Nivel 1)
    ├── 🏭 Producción (AREA - Nivel 2)
    │   ├── Línea de Filete (SUB-AREA - Nivel 3)
    │   ├── Línea de Eviscerado (SUB-AREA - Nivel 3)
    │   ├── Línea de Empaque (SUB-AREA - Nivel 3)
    │   └── Zona de Recepción (SUB-AREA - Nivel 3)
    │
    ├── 📦 Almacenamiento y Logística (AREA - Nivel 2)
    │   └── Cámara Frigorífica Principal (SUB-AREA - Nivel 3)
    │
    ├── 🔧 Mantenimiento (AREA - Nivel 2)
    │
    └── ✅ Control de Calidad (AREA - Nivel 2)
```

### Requisitos

- ✅ Debes estar logueado como **administrador**
- ✅ Primera vez que abres el selector de ubicación
- ✅ No debe haber nodos de jerarquía existentes

### Personalización posterior

Después de la inicialización automática, puedes:

1. Ve a **Jerarquías** en el menú
2. Edita los nombres de las áreas según tu planta
3. Agrega más áreas, sub-áreas, sistemas, etc.
4. Desactiva las que no necesites

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

#### ❌ Sigue sin aparecer después de esperar

**Solución**:
1. Recarga la página manualmente (F5)
2. Verifica que estés logueado como **admin**
3. Abre la consola del navegador (F12) y busca errores
4. Si ves error de permisos, contacta soporte

#### ❌ La inicialización falla

**Posibles causas**:
- No tienes rol de administrador
- Problema de conexión a Firebase
- Reglas de Firestore mal configuradas

**Ver logs**:
Abre consola del navegador (F12) y busca:
```
[HierarchySelector] Auto-inicializando sistema...
[HierarchySelector] Sistema inicializado, recargando...
```

### Gestión manual (opcional)

Si prefieres crear la estructura manualmente:

1. Ve a **Jerarquías**
2. Crea primero un nodo **EMPRESA** (nivel 1):
   - Nombre: Tu empresa
   - Código: codigo-unico
   - Nivel: **1 - EMPRESA**
   - Parent: **Ninguno**
3. Luego crea **AREAS** (nivel 2) bajo la empresa
4. Finalmente **SUB-AREAS** (nivel 3)

---

**Versión**: 1.1.5  
**Cambio importante**: Ya no hay botón manual - todo es automático  
**Fecha**: 25 de diciembre de 2025
