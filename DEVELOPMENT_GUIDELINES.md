# 📋 Guía de Desarrollo - Comportamiento Esperado para IA

Este documento define cómo debe comportarse la IA al trabajar en este proyecto.

---

## 🎯 Flujo de Finalización de Iteración EXITOSA

**IMPORTANTE**: Aplicar este flujo al final de CADA iteración exitosa (después de terminar el trabajo solicitado).

### Paso 1: Resumen de Cambios
Documentar de forma clara qué se implementó:

```
Cambios realizados hoy:

✅ [Descripción breve de feature 1]
✅ [Descripción breve de feature 2]
✅ [Descripción breve de fix 1]
...

Tipo: feat | fix | refactor | chore
```

### Paso 2: Checklist de Validación
```
Tareas:

□ Revisar errores en VS Code (get_errors) y corregirlos si existen
□ Determinar versión actual y calcular nueva versión (patch/minor/major)
□ Actualizar versión en:
  - apps/pwa/package.json
  - ROOT package.json (si aplica)
□ Actualizar VERSION.md con changelog detallado
□ Ejecutar Build PWA
□ Commit y push a main
```

### Paso 3: Determinación de Versión
Usar **Semantic Versioning (MAJOR.MINOR.PATCH)**:

- **PATCH** (x.x.+1): Fixes, correcciones menores sin funcionalidad nueva
- **MINOR** (x.+1.0): Features nuevas, mejoras UI/UX
- **MAJOR** (+1.0.0): Breaking changes, reestructuraciones importantes

---

## 🔍 Validaciones Críticas SIEMPRE

1. **Antes de Build**: Ejecutar `get_errors` en archivos modificados
2. **Antes de Commit**: Verificar build sin warnings
3. **En VERSION.md**: Documentar cada cambio con emoji descriptivo:
   - ✅ Feature nueva
   - 🔧 Fix/corrección
   - 🎨 Mejora UI/UX
   - 📝 Documentación
   - ♻️ Refactor

---

## 📝 Formato VERSION.md

```markdown
## Versión Actual: **vX.Y.Z**

**Fecha de lanzamiento**: DD de mes de YYYY  
**Estado**: ✅ PRODUCCIÓN READY  
**Build**: ✅ OK

### vX.Y.Z - Descripción corta (DD/MM/YYYY)

**Nuevas Funcionalidades:**
- ✅ Feature 1 con descripción
- ✅ Feature 2 con descripción

**Correcciones:**
- 🔧 Fix 1 con descripción
- 🔧 Fix 2 con descripción

**Mejoras:**
- 🎨 Mejora UI 1
- 🎨 Mejora UI 2
```

---

## 📍 Mappings Comunes - CRÍTICO

**BUG RECIENTE**: Cuando mapeas datos de Firebase, SIEMPRE incluye todos los campos de la interface:

```typescript
// ❌ INCORRECTO - Falta categoryId
const machine = {
  id: doc.id,
  nombre: data.nombre,
  // ... FALTA categoryId
}

// ✅ CORRECTO - Todos los campos mapeados
const machine = {
  id: doc.id,
  nombre: data.nombre,
  categoryId: data.categoryId || null,  // 👈 SIEMPRE mapear
  // ...
}
```

Interfaces con mappings críticos:
- `Machine` - SIEMPRE: categoryId, activa, color
- `Repuesto` - SIEMPRE: tags, categoryId
- `MachineCategory` - SIEMPRE: activa, orden

---

## 🚀 Comando de Finalización

Al terminar exitosamente, usar este flujo:

```bash
# 1. Validar
get_errors() en archivos críticos

# 2. Versionado
- Bump version en package.json
- Update VERSION.md

# 3. Build
Build PWA

# 4. Commit
git add -A
git commit -m "tipo: descripción breve

- Cambio 1
- Cambio 2"
git push origin main
```

---

## 💡 Notas Especiales

- **localStorage**: Siempre usar para preferencias (tema, etc.)
- **Real-time**: Preferir `onSnapshot` sobre polling
- **Error Handling**: Siempre con try-catch y user feedback (toast)
- **Tipos**: Usar TypeScript estrictamente, tipos explícitos

---

## 📌 Última Actualización
**Creado**: 21 de enero de 2026  
**Propósito**: Guiar comportamiento de IA entre sesiones
