# 🧪 GUÍA DE VALIDACIÓN - VERIFICA QUE TODO FUNCIONA

**Duración:** 5-10 minutos  
**Requisitos:** App corriendo + Firestore poblada

---

## ✅ PASO 1: Validar Firestore

### 1.1 Verifica Collections
1. Abre: https://console.firebase.google.com
2. Selecciona tu proyecto
3. Ve a Firestore Database
4. Deberías ver:
   ```
   ✓ machines (1 documento)
   ✓ plantAssets (61 documentos)
   ✓ plantMaps (3 documentos)
   ```

### 1.2 Verifica Datos de Máquina
1. Click en `machines` → `baader-200`
2. Deberías ver:
   - nombre: "Baader 200"
   - marca: "Baader"
   - modelo: "200"
   - activa: true

### 1.3 Verifica Subcolección de Repuestos
1. En `baader-200` haz scroll
2. Deberías ver "repuestos" (subcolección)
3. Click en `repuestos`
4. Deberías ver 150 documentos (rep-0001, rep-0002, etc.)

### 1.4 Verifica Datos de Repuesto
1. Click en `rep-0001`
2. Expande el documento
3. Deberías ver campos:
   ```
   ✓ codigoSAP
   ✓ codigoBaader
   ✓ textoBreve
   ✓ valorUnitario (ej: 125000)
   ✓ cantidadStockBodega (ej: 5)
   ✓ tags []
   ✓ createdAt
   ✓ updatedAt
   ```

### 1.5 Verifica Plant Assets
1. Vuelve a la vista principal
2. Click en `plantAssets`
3. Deberías ver ~61 documentos
4. Ejemplos de nombres:
   - asset-720004340
   - asset-720004341
   - asset-720004342

### 1.6 Verifica Mapas
1. Click en `plantMaps`
2. Deberías ver 3 documentos:
   - map-acopio
   - map-chonchi
   - map-yal
3. Click en `map-acopio`
4. Deberías ver:
   - nombre: "Planta Acopio"
   - marcadores (array con 40 items)
   - Cada marcador tiene: id, x, y, label, type

---

## ✅ PASO 2: Validar App UI

### 2.1 Abre la App
```bash
http://localhost:5173
```
✅ Debería cargar sin errores

### 2.2 Ve a Catálogo de Repuestos
```
Menú → Catálogo de Repuestos
  ↓
```

#### TEST: Ver máquinas en tabs
- [ ] Aparece tab "Baader 200"
- [ ] Tab tiene color azul (#3b82f6)
- [ ] Al hacer click se activa

#### TEST: Ver repuestos
- [ ] Tab muestra 150 repuestos
- [ ] Se ven columnas: Código SAP, Descripción, Precio, Stock
- [ ] Los datos se actualizan en tiempo real

**Ejemplo de repuesto:**
```
Código SAP: 4500000001
Descripción: Motor Siemens #1
Precio: $125,000
Stock: 5 unidades
```

#### TEST: Búsqueda
1. En la caja de búsqueda, escribe "Motor"
2. [ ] Deberías ver ~10 resultados filtrando
3. Limpia y escribe "123456"
4. [ ] Deberías ver solo repuestos con ese código SAP

#### TEST: Filtros
1. Click en dropdown de filtros
2. [ ] Deberías ver opciones de sorting
3. Selecciona "Precio mayor a menor"
4. [ ] La tabla se reordena

#### TEST: Paginación
1. Si hay más de 10 repuestos por página
2. [ ] Deberías ver numeración (1, 2, 3...)
3. Click en página 2
4. [ ] Aparecen repuestos 11-20

---

## ✅ PASO 3: Validar Catálogo de Bases

### 3.1 Abre Catálogo de Bases
```
Menú → Catálogo de Bases
  ↓
```

#### TEST: Ver estadísticas
- [ ] Tarjeta "Repuestos": ≥100 (150 total)
- [ ] Tarjeta "Motores": 7
- [ ] Tarjeta "Bombas": 54
- [ ] Tarjeta "Con imágenes": 0 (demo)
- [ ] Tarjeta "En mapas": 95

#### TEST: Tabla de Bases (Equipos)
- [ ] Aparecen 61 equipos
- [ ] Columnas visibles: Tipo, Equipo, Área, Componente, Marca, Potencia

**Ejemplo:**
```
Tipo: Bomba (icono)
Equipo: BOMBA VACIO ANILLO LIQUIDO N1
Área: ACOPIO
Marca: Diverso
```

#### TEST: Filtro por tipo
1. Dropdown "Todos"
2. Selecciona "Motores"
3. [ ] Solo aparecen 7 motores
4. Selecciona "Bombas"
5. [ ] Solo aparecen 54 bombas

#### TEST: Búsqueda en tabla
1. Caja de búsqueda
2. Escribe "BOMBA"
3. [ ] Filtra mostrando solo bombas (~54)
4. Escribe "MOTOR"
5. [ ] Filtra mostrando solo motores (~7)

#### TEST: Click en equipo
1. Click en cualquier fila
2. [ ] Abre modal con detalles
3. Deberías ver:
   - Código SAP
   - Tipo de equipo
   - Especificaciones técnicas
   - Ubicación en mapas (si está marcado)

---

## ✅ PASO 4: Validar Mapas

### 4.1 Ve a Mapas
```
Catálogo de Bases → Pestaña "Mapas"
  ↓
```

#### TEST: Ver lista de mapas
- [ ] Dropdown con 3 mapas:
  - Planta Acopio
  - Planta Chonchi - Línea Producción
  - Planta Yal - Área de Tratamiento

#### TEST: Seleccionar mapa
1. Dropdown → Selecciona "Planta Acopio"
2. [ ] Aparece sección de visualización
3. [ ] Información: "40 marcadores"

#### TEST: Marcadores visibles
1. En mapa (zona blanca)
2. [ ] Deberías ver ~40 círculos azules
3. Cada uno es un marcador de equipo

#### TEST: Interacción con marcadores
1. Pasar ratón sobre marcador
2. [ ] Aparece tooltip con nombre del equipo
3. Click en marcador
4. [ ] Aparece nombre y detalles

#### TEST: Cambiar mapa
1. Dropdown → Selecciona "Planta Chonchi"
2. [ ] Marcadores se actualizan
3. [ ] Ahora muestra ~30 marcadores
4. Cambiar a "Planta Yal"
5. [ ] Muestra ~25 marcadores

#### TEST: Info de marcadores
1. Scroll en la sección "Motores/Bombas en este mapa"
2. [ ] Lista todos los marcadores del mapa actual
3. [ ] Muestra: nombre, tipo (motor/bomba)

---

## ✅ PASO 5: DevTools - Validación Técnica

### 5.1 Abre DevTools
```
F12 → Consola
```

#### TEST: Sin errores
- [ ] Consola limpia (sin rojo ❌)
- [ ] Puede haber advertencias (amarillo ⚠️)

#### TEST: Logs de Firebase
1. Busca logs que digan:
   ```
   ✓ [useRepuestos] useEffect triggered
   ✓ Snapshot received: 150 repuestos
   ✓ [usePlantAssets] 61 assets cargados
   ✓ [usePlantMaps] 3 mapas cargados
   ```

### 5.2 Network Tab
1. Abre DevTools → Network
2. Recarga página (F5)
3. Deberías ver requests a:
   ```
   ✓ firestore.googleapis.com (queries)
   ✓ localhost:5173 (assets de la app)
   ```

### 5.3 Storage (Firebase)
1. DevTools → Application → Storage
2. Busca "FirebaseAppCache"
3. Deberías ver datos cacheados (si está habilitado)

---

## ✅ PASO 6: Pruebas de Búsqueda Avanzada

### TEST: Búsqueda por código SAP
1. Dashboard → Tab Baader 200
2. Buscar: "4500000001"
3. [ ] Encuentra exactamente 1 repuesto

### TEST: Búsqueda por descripción
1. Buscar: "Motor"
2. [ ] Encuentra ~10 motores

### TEST: Búsqueda por área en mapas
1. Catálogo → Mapas
2. Selecciona "Planta Chonchi"
3. Scroll → lista de equipos
4. [ ] Aparecen solo equipos de esa planta

---

## ✅ PASO 7: Pruebas de Rendimiento

### TEST: Carga inicial
- [ ] La app carga en < 3 segundos
- [ ] Los datos aparecen en < 2 segundos

### TEST: Actualización en tiempo real
1. Abre Firebase Console (en otra pestaña)
2. Modifica un repuesto (actualiza "cantidadStockBodega")
3. Vuelve a la app
4. [ ] El cambio aparece en < 1 segundo

### TEST: Cambio de tabs
1. Haz click en diferentes tabs de máquinas
2. [ ] La UI responde instantáneamente
3. [ ] Los datos se cargan en < 1 segundo

---

## ✅ PASO 8: Pruebas de Edge Cases

### TEST: Sin conexión
1. Abre DevTools → Network → Offline
2. Intenta navegar
3. [ ] La app muestra mensaje de error apropiado
4. Reconecta
5. [ ] Los datos vuelven a cargar

### TEST: Repuesto sin tags
1. Busca repuesto
2. [ ] Si no tiene tags, muestra vacío
3. No debería haber error

### TEST: Marcador sin imagen
1. Haz click en marcador
2. [ ] No muestra imagen si no hay
3. No debería haber error

---

## ✅ CHECKLIST FINAL

### Firestore
- [ ] Collections creadas (3)
- [ ] Documentos correctos (215+)
- [ ] Campos rellenados
- [ ] Timestamps presentes

### UI - Repuestos
- [ ] 150 repuestos visibles
- [ ] Búsqueda funciona
- [ ] Precios correctos
- [ ] Stock actualizado
- [ ] Tags visibles

### UI - Equipos
- [ ] 61 equipos en tabla
- [ ] Filtros por tipo funcionan
- [ ] Búsqueda funciona
- [ ] Modal de detalles abre

### UI - Mapas
- [ ] 3 mapas disponibles
- [ ] 95+ marcadores visibles
- [ ] Interactividad funciona
- [ ] Tooltips aparecen

### Performance
- [ ] Carga < 3 seg
- [ ] Sin errores en consola
- [ ] Cambios en tiempo real

---

## 🔴 SI ALGO NO FUNCIONA

### Problema: No aparecen datos
**Solución:**
1. Verifica que Firestore esté poblada (Firebase Console)
2. Recarga la página (Ctrl+F5)
3. Abre DevTools → Console → Busca errores
4. Si falta data: `node scripts/import_demo_data.js --all`

### Problema: Error de permisos
**Solución:**
1. Verifica Firestore Rules en Firebase Console
2. Asegúrate que permitan lectura pública
3. Si necesitas debug: habilita `console.log` en hooks

### Problema: Datos incorrectos
**Solución:**
1. Limpia datos: `node scripts/clean_firestore.js`
2. Regenera: `node scripts/import_demo_data.js --all`
3. Reinicia app: `npm run dev`

### Problema: Mapas sin imagen
**Nota:** Los mapas demo no tienen imágenes. Es normal.
Para usar imágenes reales:
1. Sube PNG/JPG a `/public/images/maps/`
2. Actualiza URLs en `demo_maps.json`
3. Reimporta datos

---

## ✨ RESULTADO ESPERADO

Si todo funciona:
- ✅ Ves 150 repuestos en la tabla
- ✅ Ves 61 equipos en catálogo
- ✅ Ves 3 mapas con 95 marcadores
- ✅ Búsqueda y filtros responden rápido
- ✅ Sin errores en consola
- ✅ Cambios en tiempo real

**¡Felicitaciones! La app está lista para usar.** 🎉

---

**Fecha de validación:** ___________  
**Testeador:** ___________  
**Resultado:** [ ] ✅ PASÓ [ ] ❌ FALLÓ

**Notas:** ___________________________________________________________
