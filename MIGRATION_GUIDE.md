# 🔄 Guía de Migración de Máquinas y Repuestos

## 📊 Resumen de Datos

- **Máquinas**: 9 máquinas creadas
  - Baader 200 (máquina principal)
  - Cinta Esquelones
  - Cinta Salida Filete
  - Balanza Dinámica MAREL
  - Cinta Aceleración MAREL
  - Cinta Alimentación Baader
  - Volcador Bins
  - Sistema Bombeo Peces N1
  - Sistema Bombeo Peces N2

- **PlantAssets (Motores/Bombas)**: 61 equipos registrados
  - 7 Motores
  - 54 Bombas

- **Repuestos**: Migración de Baader 200 (legacy → nuevo)

## 🚀 Opciones de Importación

### **Opción 1: Firebase Console (Recomendado - UI Fácil)**

1. **Abre Firebase Console**
   ```
   https://console.firebase.google.com
   ```

2. **Selecciona tu proyecto**
   - Busca `mantenimiento-planta` o similar

3. **Navega a Firestore Database**
   - Click en "Firestore Database" en el sidebar
   - Ve a la pestaña "Datos"

4. **Importa Máquinas**
   - Click en "+" para crear nueva colección
   - Nombre: `machines`
   - Selecciona "Importar documento"
   - Carga: `output/machines.json`

5. **Importa PlantAssets**
   - Repite el proceso
   - Nombre: `plantAssets`
   - Carga: `output/plant_assets.json`

### **Opción 2: Firebase Emulator (Local)**

```bash
# 1. Inicia emulator
firebase emulators:start

# 2. Abre emulator UI
# http://localhost:4000

# 3. Importa los archivos JSON igual que en Console
```

### **Opción 3: Admin SDK (Programático)**

```bash
# Requiere serviceAccountKey.json en el root del proyecto

# Generar datos
node scripts/generate_migration_data.js

# Importar datos
node scripts/import_migration_data.js

# O con dry-run (sin escribir)
node scripts/import_migration_data.js --dry-run

# O test de conexión
node scripts/import_migration_data.js --test
```

### **Opción 4: Firebase CLI + Extensión de Importación**

```bash
# Si tienes extensión configurada
firebase ext:install firestore-bulk-loader

# Luego seguir instrucciones de la extensión
```

## 📂 Estructura de Datos Generada

### **machines.json**
```json
[
  {
    "id": "baader-200",
    "nombre": "Baader 200",
    "marca": "Baader",
    "modelo": "200",
    "descripcion": "Máquina principal - Fileteadora Baader 200",
    "activa": true,
    "color": "#3b82f6",
    "orden": 0
  },
  ...
]
```

### **plant_assets.json**
```json
[
  {
    "id": "asset-720004341",
    "codigo": "720004341",
    "denominacion": "BOMBA VACIO ANILLO LIQUIDO N1",
    "tipo": "bomba",
    "padre": "720004340",
    "area": "ACOPIO",
    "marca": "Diverso",
    "modelo": "BOMBA VACIO ANILLO LIQUIDO N1",
    "descripcion": "BOMBA - BOMBA VACIO ANILLO LIQUIDO N1",
    "especificaciones": {
      "potencia": null,
      "voltaje": null,
      "amperaje": null,
      "rpm": null
    },
    "imagenes": [],
    "marcadores": [],
    "referencias": [],
    "estado": "operativo"
  },
  ...
]
```

## ✅ Validación Post-Importación

Después de importar, verifica:

1. **Máquinas creadas**
   ```
   Firestore > machines
   - Debe haber 9 documentos
   - IDs: baader-200, cinta-esquelones, etc.
   ```

2. **PlantAssets registrados**
   ```
   Firestore > plantAssets
   - Debe haber 61 documentos
   - Tipos: motor, bomba
   ```

3. **Repuestos migrados (opcional)**
   ```
   Firestore > machines > baader-200 > repuestos
   - Si existían en repuestosBaader200
   ```

4. **UI Funcional**
   - Abre la PWA
   - Navega a "Repuestos > Catálogo de Bases"
   - Verifica que aparezcan las máquinas en tabs
   - Verifica que aparezcan motores/bombas en tabla

## 🔧 Troubleshooting

### **Error: "Permiso denegado al escribir"**
- Verifica firestore.rules
- Asegúrate de tener permisos de escritura en desarrollo
- En producción, añade validaciones necesarias

### **Error: "Collection no existe"**
- Las colecciones se crean automáticamente al importar
- O créalas manualmente en Firebase Console

### **Error: "JSON inválido"**
- Verifica que `output/machines.json` y `output/plant_assets.json` existan
- Ejecuta primero: `node scripts/generate_migration_data.js`

### **Error: "Firebase no conecta"**
- En Opción 3: Verifica `GOOGLE_APPLICATION_CREDENTIALS` o `serviceAccountKey.json`
- En Opción 1: Verifica login en Firebase Console
- En Opción 2: Asegúrate que emulator esté corriendo

## 📝 Notas Importantes

1. **Datos Existing**: Si ya tienes máquinas/assets, la importación los saltará (merge mode)
2. **Timestamps**: Se agregan automáticamente con `createdAt` y `updatedAt`
3. **Repuestos Legacy**: Si tienes `repuestosBaader200`, pueden migrarse
4. **Jerarquía**: Se extrae de `data/jerarquia/JERARQUIA_COMPLETA_VERIFICADA.json`

## 🎯 Siguiente: Verificar UI

Una vez importados los datos:

```bash
# Build PWA
pnpm -C apps/pwa build

# Verificar Catálogo de Bases
# URL: http://localhost:5173/repuestos/catalogo-bases

# Verifica que veas:
# - Tabla con motores/bombas
# - Mapas de planta
# - Modal con detalles
```

## 📞 Soporte

Si tienes problemas:
1. Verifica `output/machines.json` y `output/plant_assets.json`
2. Valida JSON: `node -e "console.log(require('./output/machines.json'))"`
3. Revisa los logs de Firebase Console
4. Consulta `functions/migrate_data.js` para lógica de migración
