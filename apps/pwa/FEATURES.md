# 🎨 Características del Sistema de Mapas

## 📍 Mapas Interactivos Dual-Mode

### Modo PNG/JPG (Actual)
✅ **Funcionando ahora**
- Zoom 0.5x - 10x sin errores preventDefault
- Resolución original mantenida
- Overlay de zonas dibujadas manualmente
- Marcadores de incidencias posicionados

### Modo SVG (Listo para usar)
🚀 **Activación automática al subir archivo .svg**

#### Funcionalidades Automáticas:

**1. Detección de Elementos**
```typescript
// El sistema detecta automáticamente:
- Elementos con atributo id="PROD-01"
- Grupos <g> organizados por capas
- Formas: <rect>, <circle>, <polygon>, <path>
```

**2. Vinculación con Zonas**
```typescript
// Si zona.codigo === "PROD-01"
// Busca en SVG:
- id="PROD-01"
- id="prod-01" (lowercase)
- id="zona-PROD-01"
- id="zone-PROD-01"

// Al encontrar match:
✅ Colorea dinámicamente según incidencias
✅ Agrega interactividad (click, hover)
✅ Muestra tooltip nativo
```

**3. Estados Visuales Dinámicos**
```css
Sin incidencias:     fill: zona.color, opacity: 0.2
Incidencias medias:  fill: #3b82f6,    opacity: 0.2
Incidencias altas:   fill: #f59e0b,    opacity: 0.25
Incidencias críticas: fill: #ef4444,   opacity: 0.3
```

**4. Marcadores Inyectados**
```xml
<!-- Se agregan automáticamente al SVG -->
<g id="incident-markers">
  <g transform="translate(x, y)">
    <circle r="8" fill="#ef4444"/>
    <title>Falla en motor principal</title>
  </g>
</g>
```

**5. Animaciones**
```xml
<!-- Incidencias críticas pulsan -->
<animate attributeName="r" 
         values="8;12;8" 
         dur="2s" 
         repeatCount="indefinite"/>
```

## 🔄 Comparativa de Formatos

| Característica | PNG/JPG | SVG Interactivo |
|---------------|---------|-----------------|
| **Calidad al zoom** | Píxeles (se pixela) | Vector (perfecto siempre) |
| **Tamaño archivo** | 1-5 MB | 50-500 KB |
| **Zonas** | Dibujar manualmente | Ya en el plano |
| **Máquinas** | Overlay HTML | Elementos nativos |
| **Edición plano** | Re-exportar todo | Editar SVG directo |
| **Colores dinámicos** | Overlay CSS | Manipulación SVG |
| **Marcadores** | HTML absoluto | SVG coordenadas |
| **Performance** | Buena | Excelente |
| **Compatibilidad** | 100% | 100% |

## 📊 Uso del Sistema

### Para PNG/JPG (Método Actual):

1. **Subir plano**
   ```
   Editar Zonas → Subir Plano → Seleccionar PNG/JPG
   ```

2. **Dibujar zonas**
   ```
   Click "Dibujar Zona" → Click en puntos → Completar polígono
   ```

3. **Asignar información**
   ```
   Formulario: nombre, código, tipo, color
   ```

### Para SVG (Método Avanzado):

1. **Exportar desde AutoCAD**
   ```
   EXPORTTOSVG → Seleccionar capas → Guardar
   ```

2. **Configurar IDs** (ver SVG_SETUP_GUIDE.md)
   ```
   Asegurar que capas tengan IDs únicos (PROD-01, ALM-01, etc.)
   ```

3. **Subir a PWA**
   ```
   Editar Zonas → Subir Plano → Seleccionar .svg
   ```

4. **Vincular zonas** (automático o manual)
   ```
   Crear zona con código que coincida con ID del SVG
   ```

5. **¡Listo!**
   ```
   ✅ Zoom infinito
   ✅ Colores dinámicos
   ✅ Marcadores auto-posicionados
   ✅ Interactividad completa
   ```

## 🎯 Ventajas SVG para Tu Caso de Uso

### 1. Mantenimiento del Plano

**Con PNG:**
```
Necesitas agregar máquina nueva:
1. Abrir AutoCAD
2. Editar DWG
3. Exportar PNG
4. Subir a Firebase
5. Re-dibujar todas las zonas
```

**Con SVG:**
```
Necesitas agregar máquina nueva:
1. Abrir AutoCAD
2. Editar DWG
3. Exportar SVG (mantiene IDs)
4. Subir a Firebase
5. ¡Zonas ya vinculadas!
```

### 2. Identificación Visual

**Con PNG:**
- Marcadores HTML flotantes
- Posicionamiento relativo (porcentajes)
- Puede descuadrarse con zoom extremo

**Con SVG:**
- Marcadores nativos en coordenadas absolutas
- Escalan perfectamente con zoom
- Precisión pixel-perfect

### 3. Estados de Máquinas

**Con PNG:**
```jsx
// Overlay de imagen sobre máquina
<div style={{ 
  position: 'absolute', 
  left: '45%', 
  top: '30%' 
}}>
  <span>Máquina en mantenimiento</span>
</div>
```

**Con SVG:**
```typescript
// Cambiar color directo en el SVG
const maquina = svgDoc.getElementById('TOR-01')
maquina.style.fill = '#f59e0b' // Amarillo = mantenimiento
maquina.style.fill = '#22c55e' // Verde = operativo
maquina.style.fill = '#ef4444' // Rojo = fuera de servicio
```

### 4. Reportes y Análisis

**Con PNG:**
- Información almacenada separada del plano
- Vincular visualmente requiere cálculos

**Con SVG:**
```typescript
// Cada elemento tiene su ID
const zonaProduccion = svgDoc.getElementById('PROD-01')
const coordenadas = zonaProduccion.getBBox()

// Generar informe:
console.log('Zona PROD-01:', {
  area: coordenadas.width * coordenadas.height,
  incidencias: getIncidentsByZone('PROD-01').length,
  criticidad: calculateZoneCriticality('PROD-01')
})
```

## 🚀 Próximos Pasos Recomendados

### Fase 1: Prueba con PNG (✅ Completa)
- Sistema funcionando
- Zonas dibujadas manualmente
- Resolución original preservada

### Fase 2: Migración a SVG (🎯 Recomendado)
1. Exportar plano actual a SVG
2. Configurar IDs en AutoCAD
3. Subir SVG a Firebase
4. Verificar vinculación automática
5. ¡Disfrutar zoom infinito!

### Fase 3: Funciones Avanzadas (🔮 Futuro)
- Importación automática de zonas desde SVG
- Editor SVG in-app (sin AutoCAD)
- Layers toggleables (mostrar/ocultar capas)
- Rutas de recorrido optimizadas
- Heatmaps de incidencias

## 📚 Documentación Completa

- **[SVG_SETUP_GUIDE.md](../../SVG_SETUP_GUIDE.md)** - Configuración paso a paso
- **[InteractiveSVGMap.tsx](./src/components/map/InteractiveSVGMap.tsx)** - Código fuente
- **[MapPage.tsx](./src/pages/MapPage.tsx)** - Integración en página

## 💡 Tips

### Optimización SVG

```bash
# Reducir tamaño sin perder calidad
npx svgo plano-planta.svg -o plano-optimizado.svg
```

### Verificar IDs

```bash
# Listar todos los IDs del SVG
grep -o 'id="[^"]*"' plano-planta.svg
```

### Testear SVG en Navegador

Abre el .svg directamente en Chrome y abre DevTools:

```javascript
// Probar en consola del navegador
document.getElementById('PROD-01').style.fill = 'red'
```

---

🎉 **Sistema listo para PNG y SVG** - Usa el que mejor se adapte a tu flujo de trabajo.
