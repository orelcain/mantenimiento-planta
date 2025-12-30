# 🎨 Guía de Configuración SVG para Mapas Interactivos

## 📋 Tabla de Contenidos
- [Exportar desde AutoCAD](#exportar-desde-autocad)
- [Preparar IDs para Elementos](#preparar-ids)
- [Estructura Recomendada](#estructura)
- [Subir a la PWA](#subir)
- [Vincular Zonas](#vincular)

---

## 🔧 Exportar desde AutoCAD

### Opción 1: Comando EXPORTTOSVG (Recomendado)

```
1. Abrir "PLC9 PLANTA GENERAL.dwg"
2. Escribir comando: EXPORTTOSVG
3. Opciones:
   - Selección: "Todo" (o seleccionar capas específicas)
   - Opciones de salida: 
     ✓ Mantener estructura de capas
     ✓ Incluir atributos de bloque
     ✓ Usar nombres de capa como IDs
4. Guardar como: "plano-planta.svg"
```

### Opción 2: Exportar como DXF → Convertir a SVG

Si EXPORTTOSVG no está disponible:

```
1. AutoCAD: Guardar como → DXF
2. Usar herramienta online:
   - https://cloudconvert.com/dxf-to-svg
   - https://convertio.co/dxf-svg/
3. Descargar SVG resultante
```

---

## 🏷️ Preparar IDs para Elementos

### Antes de Exportar (CRÍTICO)

**En AutoCAD, renombrar capas con códigos únicos:**

```
Capa Original          →  Nuevo Nombre (ID)
─────────────────────────────────────────────
ZONA_PRODUCCION_1      →  PROD-01
ZONA_ALMACEN           →  ALM-01
MAQUINA_TORNO_1        →  TOR-01
MAQUINA_FRESADORA_2    →  FRE-02
AREA_CARGA_DESCARGA    →  CAR-01
```

**Reglas para IDs:**
- ✅ Únicos (no duplicados)
- ✅ Sin espacios (usa guiones: `PROD-01`)
- ✅ Sin caracteres especiales (solo letras, números, guiones)
- ✅ Cortos y descriptivos (máx 20 caracteres)
- ✅ Coinciden con campo `codigo` en Firestore

### Después de Exportar (Opcional)

Si no pudiste configurar IDs antes, edita el SVG manualmente:

```xml
<!-- Antes -->
<rect id="layer1" x="100" y="200" width="300" height="400"/>

<!-- Después -->
<rect id="PROD-01" x="100" y="200" width="300" height="400"/>
```

---

## 🗂️ Estructura Recomendada del SVG

### Capas Organizadas

Tu SVG debe tener esta estructura:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 1500">
  
  <!-- Grupo de zonas de producción -->
  <g id="zonas-produccion">
    <rect id="PROD-01" x="100" y="100" width="400" height="300"/>
    <rect id="PROD-02" x="550" y="100" width="400" height="300"/>
  </g>

  <!-- Grupo de almacenes -->
  <g id="zonas-almacen">
    <rect id="ALM-01" x="100" y="450" width="300" height="200"/>
  </g>

  <!-- Grupo de máquinas -->
  <g id="maquinas">
    <circle id="TOR-01" cx="250" cy="250" r="20"/>
    <circle id="FRE-01" cx="450" cy="250" r="20"/>
  </g>

  <!-- Grupo de textos/etiquetas -->
  <g id="labels">
    <text x="300" y="250">Producción 1</text>
  </g>

  <!-- Elementos decorativos (sin IDs necesarios) -->
  <g id="detalles">
    <line x1="0" y1="0" x2="2000" y2="0"/>
  </g>

</svg>
```

### Recomendaciones Visuales

**Colores iniciales:**
- Zonas: Transparentes o gris claro (la PWA las colorea dinámicamente)
- Máquinas: Color neutral (#cccccc)
- Texto: Negro (#000000)

**Tamaños:**
- Líneas: 1-2px de grosor
- Textos: 12-16px de altura
- Iconos: 20-30px de diámetro

---

## 📤 Subir a la PWA

### Paso 1: Acceder al Editor

```
1. Login como Admin
2. Ir a "Mapa de Planta"
3. Click en "Editar Zonas"
```

### Paso 2: Subir SVG

```
4. Click en "Subir Plano"
5. Seleccionar archivo: "plano-planta.svg"
6. Esperar carga (5-10 segundos)
7. ✅ Verás el plano con zoom infinito
```

### Paso 3: Verificar Carga

Abre consola del navegador (F12) y busca:

```
✅ SVG loaded { elementCount: 45, ids: ['PROD-01', 'ALM-01', ...] }
```

Si ves este log, los IDs fueron detectados correctamente.

---

## 🔗 Vincular Zonas con SVG

### Opción 1: Vincular Manualmente

Al crear zona en la PWA:

```
1. Click en "Dibujar Zona" (dibujas polígono)
2. Formulario:
   - Nombre: "Producción Principal"
   - Código: "PROD-01"  ← DEBE COINCIDIR con ID del SVG
   - Tipo: Producción
   - Color: #2196f3
3. Guardar
```

La PWA automáticamente buscará en el SVG elementos con IDs:
- `PROD-01`
- `prod-01` (lowercase)
- `zona-PROD-01`
- `zone-PROD-01`

### Opción 2: Importar Zonas desde SVG (Futuro)

Función planeada para importar zonas automáticamente:

```typescript
// Detectar todos los elementos con IDs
const svgElements = svgDoc.querySelectorAll('[id^="PROD-"], [id^="ALM-"]')

// Crear zona en Firestore por cada elemento
svgElements.forEach(element => {
  const id = element.getAttribute('id')
  const bounds = element.getBBox() // Obtener coordenadas
  
  createZone({
    codigo: id,
    nombre: inferName(id), // "PROD-01" → "Producción 1"
    bounds: normalizeBounds(bounds),
    color: inferColor(id)
  })
})
```

---

## 🎯 Resultado Final

### Funcionalidades Automáticas

Una vez configurado correctamente:

✅ **Zoom infinito** sin pérdida de calidad  
✅ **Colores dinámicos** según estado de incidencias  
✅ **Click en zona** abre detalles  
✅ **Marcadores de incidencias** inyectados automáticamente  
✅ **Tooltips nativos** con información de zona  
✅ **Animaciones** en incidencias críticas (pulse effect)  

### Ejemplo Visual

```
Sin incidencias:     Zona azul claro (0.2 opacity)
Incidencias medias:  Zona azul oscuro (0.25 opacity)
Incidencias altas:   Zona amarilla (0.25 opacity)
Incidencias críticas: Zona roja (0.3 opacity) + marcadores pulsantes
```

---

## 🐛 Troubleshooting

### "No se detectan elementos SVG"

**Problema:** Console muestra `elementCount: 0`

**Solución:**
1. Verifica que exportaste con "Mantener estructura de capas"
2. Abre el SVG en editor de texto
3. Busca elementos con atributo `id="..."`
4. Si no hay IDs, agrégalos manualmente

### "Zona no se colorea"

**Problema:** La zona dibujada no cambia de color en el SVG

**Solución:**
1. Verifica que `zone.codigo` coincide exactamente con ID del SVG
2. Consola debe mostrar: `Zone linked to SVG element { zoneId: '...', svgId: '...' }`
3. Si no aparece, renombra el código de la zona

### "SVG se ve cortado"

**Problema:** Parte del plano no es visible

**Solución:**
1. Edita el SVG y verifica el `viewBox`
2. Debe abarcar todas las coordenadas usadas
3. Ejemplo: `viewBox="0 0 2000 1500"` para plano de 2000x1500 unidades

### "Marcadores de incidencias no aparecen"

**Problema:** No se ven los círculos rojos de incidencias

**Solución:**
1. Verifica que las zonas tienen `bounds` calculados
2. Console debe mostrar: `Incident markers injected { count: X }`
3. Si count es 0, revisa que las zonas tengan polígonos válidos

---

## 📚 Recursos Adicionales

### Herramientas Recomendadas

- **Inkscape** (gratis): Editor SVG visual
  - Descargar: https://inkscape.org/
  - Útil para: Agregar/editar IDs, limpiar SVG

- **SVGOMG** (online): Optimizar SVG
  - URL: https://jakearchibald.github.io/svgomg/
  - Reduce tamaño sin perder calidad

- **SVG Path Editor** (online): Editar coordenadas
  - URL: https://yqnn.github.io/svg-path-editor/

### Validación SVG

Antes de subir, valida tu SVG:

```bash
# Verificar estructura
cat plano-planta.svg | grep 'id='

# Contar elementos con ID
grep -o 'id="[^"]*"' plano-planta.svg | wc -l

# Verificar viewBox
grep 'viewBox=' plano-planta.svg
```

---

## ✅ Checklist Final

Antes de subir tu SVG a producción:

- [ ] IDs únicos y sin espacios
- [ ] viewBox configurado correctamente
- [ ] Capas organizadas en grupos
- [ ] Colores iniciales neutros
- [ ] Archivo optimizado (<2MB)
- [ ] Probado en Inkscape o navegador
- [ ] Códigos coinciden con zonas en Firestore
- [ ] Backup del archivo original guardado

---

🎉 **¡Listo!** Ahora tienes un sistema de mapas interactivos de nivel profesional.
