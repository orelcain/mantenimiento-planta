# 📤 Exportación de Datos Existentes

Fecha: 20-01-2026, 1:23:02 a. m.

## Archivos Generados

### 1. repuestos_export.json
**Repuestos de todas las máquinas**
- Total: 0 repuestos
- Máquinas:
  - baader-200: 0 repuestos

**Campos de cada repuesto:**
- codigoSAP, codigoBaader, textoBreve, descripcion
- cantidadSolicitada, cantidadStockBodega, valorUnitario, total
- tags, vinculosManual, imagenesManual, fotosReales
- createdAt, updatedAt

### 2. plant_assets_export.json
**Motores y Bombas de la planta**
- Total: 0 equipos
  - Motores: 0
  - Bombas: 0

**Campos de cada asset:**
- codigo, denominacion, tipo, padre, area
- marca, modelo, descripcion
- especificaciones, imagenes, marcadores, referencias
- estado, createdAt, updatedAt

### 3. maps_export.json
**Mapas de la planta con marcadores**
- Total: 0 mapas
- Marcadores totales: 0

**Campos de cada mapa:**
- nombre, descripcion, imageUrl
- marcadores[] { id, x, y, label, assetId, type }
- areas[], createdAt, updatedAt

## Próximos Pasos

1. **Revisar datos exportados** - Verifica que los datos sean correctos
2. **Importar a nuevas máquinas** - Usa import_exported_data.js
3. **Validar en la UI** - Comprueba en CatalogoBases

## Notas

- Los datos se exportan en formato JSON puro
- Las fechas se convierten a ISO 8601
- Los timestamps de Firestore se transforman a objetos Date
