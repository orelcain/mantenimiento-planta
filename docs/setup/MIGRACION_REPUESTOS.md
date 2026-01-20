# Migración de Repuestos-App a Mantenimiento-Planta

## Descripción

Este script migra datos del sistema legacy `Repuestos-App` al nuevo sistema `mantenimiento-planta` con el módulo de repuestos refactorizado.

## Datos a Migrar

- **Baader 200**: 202 repuestos
- **Fishken**: 7 repuestos
- **Grader**: 25 repuestos
- **Total**: 234+ repuestos

## Pre-requisitos

1. **Acceso a ambos proyectos Firebase**:
   - Proyecto origen: `repuestos-app`
   - Proyecto destino: `mantenimiento-planta`

2. **Service Account Keys**:
   - Descargar `serviceAccountKey.json` del proyecto destino
   - Colocarlo en la raíz del proyecto

3. **Node.js y dependencias**:
   ```bash
   npm install firebase-admin node-fetch
   ```

## Configuración

### Opción 1: Migración desde archivos JSON

1. Exportar repuestos del proyecto origen:
   ```bash
   cd repuestos-app
   node scripts/export_repuestos.js
   ```

2. Copiar archivos JSON a `data/exports/`:
   ```
   data/exports/
     ├── baader-200_repuestos.json
     ├── fishken_repuestos.json
     └── grader_repuestos.json
   ```

3. Modificar `fetchRepuestosFromOrigen()` en el script para leer desde archivos:
   ```javascript
   const data = require(`../data/exports/${machineId}_repuestos.json`)
   return data
   ```

### Opción 2: Migración directa desde Firestore

1. Configurar segundo proyecto Firebase en el script
2. Implementar consultas directas a Firestore del origen

### Opción 3: Migración vía API REST

1. Exponer API en el proyecto origen
2. Configurar autenticación
3. Implementar fetches desde el script

## Ejecución

```bash
# Desde la raíz del proyecto mantenimiento-planta
node scripts/migrate_repuestos_app.js
```

## Qué se Migra

### ✅ Máquinas
- ID, nombre, fabricante
- Color y orden de visualización
- Estado activo/inactivo

### ✅ Repuestos
- Código SAP y texto breve
- Descripción y código Baader
- Cantidades (solicitud y stock)
- Valor unitario

### ✅ Tags
- Migración de formato antiguo (string) a nuevo (objeto con cantidad)
- Tipos: solicitud vs stock
- Cantidades por tag

### ✅ Imágenes
- Descarga desde URLs del origen
- Re-upload a Firebase Storage del destino
- Separación: imágenes de manual vs fotos reales
- Metadata preservada

### ✅ Vínculos PDF
- URLs de manuales PDF
- Marcadores visuales (coordenadas)
- Normalización de coordenadas (0-1)
- Formas: círculo, rectángulo, polígono
- Colores y descripciones

## Estructura de Salida

```
Firestore:
  machines/
    ├── baader-200/
    │   ├── (metadata)
    │   └── repuestos/
    │       ├── rep_001/
    │       ├── rep_002/
    │       └── ...
    ├── fishken/
    │   └── repuestos/
    └── grader/
        └── repuestos/

Storage:
  repuestos/
    ├── baader-200/
    │   ├── rep_001/
    │   │   ├── manual_0.jpg
    │   │   └── real_0.jpg
    │   └── rep_002/
    └── ...
```

## Validación Post-Migración

1. **Verificar conteos**:
   ```javascript
   const snapshot = await db.collection('machines').doc('baader-200').collection('repuestos').get()
   console.log('Baader 200:', snapshot.size) // Debe ser ~202
   ```

2. **Verificar imágenes**:
   - Abrir Storage en Firebase Console
   - Revisar que las imágenes se hayan subido correctamente

3. **Probar en UI**:
   - Abrir `http://localhost:5173/repuestos`
   - Seleccionar máquina
   - Verificar que los repuestos se muestren correctamente

## Troubleshooting

### Error: "Permission denied"
- Verificar que el Service Account tenga permisos de lectura/escritura
- Revisar reglas de Firestore y Storage

### Error: "Image download failed"
- Verificar que las URLs de imágenes del origen sean accesibles
- Comprobar configuración CORS

### Error: "Batch write failed"
- Reducir tamaño de batch (línea 274)
- Revisar límites de Firestore (500 operaciones por batch)

### Coordenadas de marcadores no coinciden
- Ajustar viewport de normalización (línea 132)
- Verificar que el formato en origen sea consistente

## Rollback

Si necesitas revertir la migración:

```bash
node scripts/rollback_migration.js
```

O manualmente:
1. Eliminar colecciones de repuestos:
   ```javascript
   await db.collection('machines').doc('baader-200').collection('repuestos').get()
     .then(snapshot => {
       snapshot.docs.forEach(doc => doc.ref.delete())
     })
   ```

2. Eliminar carpetas de Storage:
   - Ir a Firebase Console → Storage
   - Eliminar carpeta `repuestos/`

## Estadísticas Esperadas

- **Máquinas**: 3
- **Repuestos**: ~234
- **Imágenes**: ~500-800 (estimado)
- **Vínculos PDF**: ~150-300 (estimado)
- **Duración**: 10-30 minutos (depende de conexión)

## Contacto

Si encuentras problemas durante la migración, revisa los logs y consulta la documentación de Firebase Admin SDK.

## TODO

- [ ] Implementar `fetchRepuestosFromOrigen()` según tu setup
- [ ] Configurar bucket de Storage en línea 17
- [ ] Ajustar viewport de normalización de coordenadas
- [ ] Probar con subset pequeño antes de migración completa
- [ ] Crear backup del proyecto origen antes de migrar
