#!/usr/bin/env node

/**
 * 📤 EXPORTAR DATOS EXISTENTES
 * 
 * Lee los datos ACTUALES de Firestore y los exporta a JSON:
 * 1. Repuestos de máquinas (repuestosBaader200 y machines/{id}/repuestos)
 * 2. PlantAssets (motores/bombas)
 * 3. Mapas y marcadores
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializar Firebase
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ No se encontró serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'export');

// Crear directorio de salida
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('\n' + '='.repeat(70));
console.log('📤 EXPORTADOR DE DATOS EXISTENTES');
console.log('='.repeat(70));

// ============================================================
// 1. EXPORTAR REPUESTOS
// ============================================================
async function exportRepuestos() {
  console.log('\n📦 Exportando REPUESTOS...\n');
  
  const allRepuestos = {};
  
  // 1.1 Repuestos de Baader 200 (legacy)
  console.log('  1️⃣  Colección legacy: repuestosBaader200');
  try {
    const snapshot = await db.collection('repuestosBaader200').get();
    const baaderRepuestos = [];
    
    snapshot.forEach(doc => {
      baaderRepuestos.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
        updatedAt: doc.data().updatedAt?.toDate?.() || null,
        fechaUltimaActualizacionInventario: doc.data().fechaUltimaActualizacionInventario?.toDate?.() || null
      });
    });
    
    console.log(`     ✅ ${baaderRepuestos.length} repuestos de Baader 200`);
    allRepuestos['baader-200'] = baaderRepuestos;
  } catch (err) {
    console.error(`     ❌ Error: ${err.message}`);
  }
  
  // 1.2 Repuestos de otras máquinas
  console.log('\n  2️⃣  Subcolecciones: machines/{id}/repuestos');
  try {
    const machinesSnapshot = await db.collection('machines').get();
    
    for (const machineDoc of machinesSnapshot.docs) {
      const machineId = machineDoc.id;
      const repuestosSnapshot = await db.collection(`machines/${machineId}/repuestos`).get();
      
      if (repuestosSnapshot.size > 0) {
        const machineRepuestos = [];
        repuestosSnapshot.forEach(doc => {
          machineRepuestos.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null,
            updatedAt: doc.data().updatedAt?.toDate?.() || null,
            fechaUltimaActualizacionInventario: doc.data().fechaUltimaActualizacionInventario?.toDate?.() || null
          });
        });
        
        console.log(`     ✅ ${machineRepuestos.length} repuestos para máquina '${machineId}'`);
        allRepuestos[machineId] = machineRepuestos;
      }
    }
  } catch (err) {
    console.error(`     ❌ Error: ${err.message}`);
  }
  
  // Guardar archivo
  const repuestosPath = path.join(OUTPUT_DIR, 'repuestos_export.json');
  fs.writeFileSync(repuestosPath, JSON.stringify(allRepuestos, null, 2));
  console.log(`\n   📁 Guardado: ${repuestosPath}`);
  
  return allRepuestos;
}

// ============================================================
// 2. EXPORTAR PLANT ASSETS (MOTORES/BOMBAS)
// ============================================================
async function exportPlantAssets() {
  console.log('\n⚡ Exportando PLANT ASSETS (Motores/Bombas)...\n');
  
  try {
    const snapshot = await db.collection('plantAssets').get();
    const assets = [];
    
    snapshot.forEach(doc => {
      assets.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
        updatedAt: doc.data().updatedAt?.toDate?.() || null
      });
    });
    
    console.log(`  ✅ ${assets.length} assets encontrados`);
    
    // Contar por tipo
    const motores = assets.filter(a => a.tipo === 'motor').length;
    const bombas = assets.filter(a => a.tipo === 'bomba').length;
    console.log(`     - Motores: ${motores}`);
    console.log(`     - Bombas: ${bombas}`);
    
    // Guardar archivo
    const assetsPath = path.join(OUTPUT_DIR, 'plant_assets_export.json');
    fs.writeFileSync(assetsPath, JSON.stringify(assets, null, 2));
    console.log(`\n   📁 Guardado: ${assetsPath}`);
    
    return assets;
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return [];
  }
}

// ============================================================
// 3. EXPORTAR MAPAS Y MARCADORES
// ============================================================
async function exportMapsAndMarkers() {
  console.log('\n🗺️  Exportando MAPAS Y MARCADORES...\n');
  
  try {
    const snapshot = await db.collection('plantMaps').get();
    const maps = [];
    
    snapshot.forEach(doc => {
      const mapData = {
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
        updatedAt: doc.data().updatedAt?.toDate?.() || null
      };
      
      // Procesar marcadores
      if (mapData.marcadores) {
        mapData.marcadores = mapData.marcadores.map(m => ({
          ...m,
          createdAt: m.createdAt?.toDate?.() || null,
          updatedAt: m.updatedAt?.toDate?.() || null
        }));
      }
      
      maps.push(mapData);
    });
    
    console.log(`  ✅ ${maps.length} mapas encontrados`);
    
    // Contar marcadores
    let totalMarkers = 0;
    maps.forEach(map => {
      const count = (map.marcadores || []).length;
      totalMarkers += count;
      console.log(`     - ${map.nombre}: ${count} marcadores`);
    });
    
    console.log(`     📍 Total: ${totalMarkers} marcadores`);
    
    // Guardar archivo
    const mapsPath = path.join(OUTPUT_DIR, 'maps_export.json');
    fs.writeFileSync(mapsPath, JSON.stringify(maps, null, 2));
    console.log(`\n   📁 Guardado: ${mapsPath}`);
    
    return maps;
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return [];
  }
}

// ============================================================
// 4. CREAR RESUMEN
// ============================================================
async function createSummary(repuestos, assets, maps) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN DE EXPORTACIÓN');
  console.log('='.repeat(70));
  
  let totalRepuestos = 0;
  const repuestosByMachine = {};
  
  Object.entries(repuestos).forEach(([machine, reps]) => {
    repuestosByMachine[machine] = reps.length;
    totalRepuestos += reps.length;
  });
  
  const summary = {
    timestamp: new Date().toISOString(),
    exportPath: OUTPUT_DIR,
    data: {
      repuestos: {
        total: totalRepuestos,
        byMachine: repuestosByMachine
      },
      plantAssets: {
        total: assets.length,
        motores: assets.filter(a => a.tipo === 'motor').length,
        bombas: assets.filter(a => a.tipo === 'bomba').length
      },
      maps: {
        total: maps.length,
        totalMarkers: maps.reduce((sum, m) => sum + (m.marcadores?.length || 0), 0)
      }
    }
  };
  
  console.log('\n📋 REPUESTOS');
  console.log(`   Total: ${summary.data.repuestos.total}`);
  Object.entries(repuestosByMachine).forEach(([machine, count]) => {
    console.log(`   - ${machine}: ${count}`);
  });
  
  console.log('\n⚡ PLANT ASSETS');
  console.log(`   Total: ${summary.data.plantAssets.total}`);
  console.log(`   - Motores: ${summary.data.plantAssets.motores}`);
  console.log(`   - Bombas: ${summary.data.plantAssets.bombas}`);
  
  console.log('\n🗺️  MAPAS');
  console.log(`   Total: ${summary.data.maps.total}`);
  console.log(`   - Marcadores: ${summary.data.maps.totalMarkers}`);
  
  // Guardar resumen
  const summaryPath = path.join(OUTPUT_DIR, 'RESUMEN_EXPORTACION.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n   📁 Resumen guardado: ${summaryPath}`);
  
  // Crear archivo README
  const readmePath = path.join(OUTPUT_DIR, 'README_EXPORTACION.md');
  const readmeContent = `# 📤 Exportación de Datos Existentes

Fecha: ${new Date().toLocaleString('es-CL')}

## Archivos Generados

### 1. repuestos_export.json
**Repuestos de todas las máquinas**
- Total: ${summary.data.repuestos.total} repuestos
- Máquinas:
${Object.entries(repuestosByMachine).map(([m, c]) => `  - ${m}: ${c} repuestos`).join('\n')}

**Campos de cada repuesto:**
- codigoSAP, codigoBaader, textoBreve, descripcion
- cantidadSolicitada, cantidadStockBodega, valorUnitario, total
- tags, vinculosManual, imagenesManual, fotosReales
- createdAt, updatedAt

### 2. plant_assets_export.json
**Motores y Bombas de la planta**
- Total: ${summary.data.plantAssets.total} equipos
  - Motores: ${summary.data.plantAssets.motores}
  - Bombas: ${summary.data.plantAssets.bombas}

**Campos de cada asset:**
- codigo, denominacion, tipo, padre, area
- marca, modelo, descripcion
- especificaciones, imagenes, marcadores, referencias
- estado, createdAt, updatedAt

### 3. maps_export.json
**Mapas de la planta con marcadores**
- Total: ${summary.data.maps.total} mapas
- Marcadores totales: ${summary.data.maps.totalMarkers}

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
`;
  
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`   📁 README generado: ${readmePath}`);
  
  return summary;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  try {
    const repuestos = await exportRepuestos();
    const assets = await exportPlantAssets();
    const maps = await exportMapsAndMarkers();
    
    await createSummary(repuestos, assets, maps);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ EXPORTACIÓN COMPLETADA');
    console.log('='.repeat(70));
    console.log(`\n📁 Archivos guardados en: ${OUTPUT_DIR}\n`);
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  }
}

main();
