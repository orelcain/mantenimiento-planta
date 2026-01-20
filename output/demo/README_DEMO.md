# 🎯 Datos de Demostración

Generado: 20-01-2026, 1:24:51 a. m.

## Contenido

### 1. Repuestos (demo_repuestos.json)
- **150 repuestos** para Baader 200
- Códigos SAP realistas
- Precios entre $15,000 y $265,000 CLP
- Tags de categorización
- Cantidades en stock y solicitadas

**Uso:**
```bash
node scripts/import_demo_data.js --repuestos
```

### 2. Mapas (demo_maps.json)
- **3 mapas** de planta
- **95+ marcadores** de equipos
- Coordenadas X,Y normalizadas (0-1)
- Asociación automática a equipos

**Mapas:**
1. Planta Acopio (40 marcadores)
2. Planta Chonchi (30 marcadores)
3. Planta Yal (25 marcadores)

**Uso:**
```bash
node scripts/import_demo_data.js --maps
```

### 3. Máquinas (referencia en código)
- **5 máquinas** principales
- Ya configuradas en useMachines.ts

## Cómo Importar

### Opción 1: Importar TODO
```bash
node scripts/import_demo_data.js --all
```

### Opción 2: Importar selectivamente
```bash
node scripts/import_demo_data.js --repuestos --maps
```

### Opción 3: Validar SIN importar (dry-run)
```bash
node scripts/import_demo_data.js --all --dry-run
```

## Estructura de Datos

### Repuesto
```json
{
  "id": "rep-0001",
  "codigoSAP": "4500000000",
  "codigoBaader": "200-ROD-001",
  "textoBreve": "Motor Siemens #1",
  "descripcion": "...",
  "valorUnitario": 125000,
  "cantidadStockBodega": 5,
  "cantidadSolicitada": 2,
  "tags": [...]
}
```

### Mapa
```json
{
  "id": "map-acopio",
  "nombre": "Planta Acopio",
  "imageUrl": "/images/maps/planta-acopio.png",
  "marcadores": [
    {
      "id": "marker-acopio-001",
      "x": 0.45,
      "y": 0.65,
      "label": "Bomba Vacío N1",
      "type": "bomba"
    }
  ]
}
```

## Validación

Luego de importar, verifica en la UI:

1. **Dashboard de Repuestos**
   - [ ] Aparecen 150 repuestos
   - [ ] Precios visibles
   - [ ] Tags funcionando
   - [ ] Stock actualizado

2. **Catálogo de Bases**
   - [ ] Tabla con motores/bombas
   - [ ] Filtros funcionando
   - [ ] Mapas cargados
   - [ ] Marcadores visibles

3. **Mapas Interactivos**
   - [ ] Imágenes cargan (si existen)
   - [ ] Marcadores clickeables
   - [ ] Información de equipos

## Próximos Pasos

1. ✅ Generar datos (COMPLETADO)
2. ⏳ Importar a Firestore
3. ⏳ Validar en UI
4. ⏳ Ajustar según necesidad

---

**Nota**: Estos son datos ficticios para testing. Para datos reales, usa:
- `scripts/export_existing_data.js` (exportar de Firestore)
- `scripts/import_excel.js` (importar desde Excel)
- `scripts/import_legacy_db.js` (importar de BD anterior)
