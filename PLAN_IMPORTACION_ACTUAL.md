# 📋 PLAN CORRECTO DE IMPORTACIÓN

## Situación Actual:
- **Firebase Firestore**: 100% VACÍA (sin máquinas, sin repuestos, sin assets)
- **Código React**: Listo para mostrar datos si existen en Firestore
- **Jerarquía**: Completa en JSON con todos los motores/bombas (150+ equipos)

## Lo que FALTA:

### 1️⃣  REPUESTOS (con códigos SAP, precios)
**Pregunta**: ¿De dónde vienen estos datos?
- ¿Tienes un Excel con repuestos de Baader 200?
- ¿Base de datos legacy?
- ¿O generamos datos de ejemplo?

**Campos necesarios por repuesto:**
```json
{
  "codigoSAP": "4500123456",          // Código del proveedor
  "codigoBaader": "200-R-45",         // Código interno Baader
  "textoBreve": "Rodillo principal",  // Nombre corto
  "descripcion": "Rodillo...",        // Descripción completa
  "valorUnitario": 45000,             // Precio en CLP
  "cantidadSolicitada": 0,            // Cantidad pedida
  "cantidadStockBodega": 5,           // Cantidad en stock
  "tags": []                          // Categorías
}
```

### 2️⃣  MAPAS (con ubicaciones de motores/bombas)
**Pregunta**: ¿Tienes imágenes/planos de la planta?
- Plano Planta Chonchi (PNG/JPG)
- Plano Planta Yal
- Plano Acopio

**Por cada mapa**: Ubicaciones X,Y de motores/bombas

### 3️⃣  MÁQUINAS (ya generadas)
✅ LISTO: 9 máquinas (Baader 200, Marel, etc.)

### 4️⃣  PLANT ASSETS (motores/bombas)
✅ LISTO: 150+ equipos extraídos de la jerarquía

---

## OPCIONES DE SOLUCIÓN

### OPCIÓN A: Datos Generados (para DEMO/Testing)
✅ Sin necesidad de archivos externos
✅ Datos realistas
❌ No son datos reales

**Pasos:**
1. Generar 100-200 repuestos ficticios para Baader 200
2. Generar mapas de prueba con marcadores
3. Importar todo a Firestore
4. Validar en la UI

### OPCIÓN B: Importar desde Excel
✅ Datos reales
❌ Requiere archivo Excel

**Pasos:**
1. Subir archivo Excel con repuestos
2. Parsear con xlsx/papaparse
3. Transformar formato
4. Importar a Firestore

### OPCIÓN C: Importar desde Sistema Legacy
✅ Datos reales + histórico
❌ Requiere acceso a BD anterior

**Pasos:**
1. Conexión a BD anterior
2. Exportar repuestos/mapas
3. Transformar schema
4. Importar a Firestore

---

## PRÓXIMOS PASOS (tu decisión)

**Pregunta clave**: ¿Dónde están los repuestos reales y los mapas?

1. Si tienes **Excel con repuestos** → Sube el archivo
2. Si tienes **acceso a BD anterior** → Dame connection string
3. Si necesitas **datos de ejemplo** → Genero automáticamente
4. Si tienes **imágenes de mapas** → Sube los archivos

Una vez tengas la info, puedo:
1. ✅ Crear importador específico
2. ✅ Generar datos transformados
3. ✅ Importar a Firestore
4. ✅ Validar en la UI

---

## COMANDO RÁPIDO (Opción A: Demo)

Si quieres datos de ejemplo AHORA:
```bash
node scripts/generate_demo_data.js
```

Esto generará:
- 150 repuestos para Baader 200
- 3 mapas de prueba
- 50 marcadores
- Listos para importar

¿Procedo con Opción A o esperas más info?
