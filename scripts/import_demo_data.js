#!/usr/bin/env node

/**
 * 📥 IMPORTADOR DE DATOS DE DEMOSTRACIÓN
 * 
 * Importa datos generados a Firestore:
 * 1. Repuestos → machines/baader-200/repuestos
 * 2. Mapas → plantMaps
 * 3. Plant Assets → plantAssets (auto-generados)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const DEMO_DIR = path.join(__dirname, '..', 'output', 'demo');
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ No se encontró serviceAccountKey.json');
  process.exit(1);
}

// Inicializar Firebase
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// Parsear argumentos
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const importRepuestos = args.includes('--repuestos') || args.includes('--all');
const importMaps = args.includes('--maps') || args.includes('--all');
const importAssets = args.includes('--assets') || args.includes('--all');

console.log('\n' + '='.repeat(70));
console.log('📥 IMPORTADOR DE DATOS DE DEMOSTRACIÓN');
console.log('='.repeat(70));

if (dryRun) console.log('⚠️  MODO PRUEBA (DRY-RUN) - Sin escritura en BD');
console.log();

// ============================================================
// 1. IMPORTAR MÁQUINAS (si no existen)
// ============================================================

async function ensureMachines() {
  console.log('🤖 Asegurando máquinas...\n');
  
  const machines = [
    {
      id: 'baader-200',
      nombre: 'Baader 200',
      marca: 'Baader',
      modelo: '200',
      descripcion: 'Fileteadora principal',
      activa: true,
      color: '#3b82f6',
      orden: 0
    }
  ];
  
  for (const machine of machines) {
    try {
      const docRef = db.collection('machines').doc(machine.id);
      const existing = await docRef.get();
      
      if (existing.exists) {
        console.log(`  ✅ Máquina existe: ${machine.id}`);
      } else {
        if (dryRun) {
          console.log(`  ✓ [DRY-RUN] Crear máquina: ${machine.id}`);
        } else {
          await docRef.set({
            ...machine,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          });
          console.log(`  ✅ Máquina creada: ${machine.id}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }
  
  console.log();
}

// ============================================================
// 2. IMPORTAR REPUESTOS
// ============================================================

async function importRepuestosData() {
  if (!importRepuestos) return;
  
  console.log('📦 Importando REPUESTOS...\n');
  
  const repuestosPath = path.join(DEMO_DIR, 'demo_repuestos.json');
  if (!fs.existsSync(repuestosPath)) {
    console.error(`  ❌ Archivo no encontrado: ${repuestosPath}`);
    return;
  }
  
  const repuestos = JSON.parse(fs.readFileSync(repuestosPath, 'utf-8'));
  const machineId = 'baader-200';
  const collectionPath = `machines/${machineId}/repuestos`;
  
  let importedCount = 0;
  let errorCount = 0;
  const batch = db.batch();
  let batchSize = 0;
  const BATCH_LIMIT = 400;
  
  for (const rep of repuestos) {
    try {
      const docRef = db.collection(collectionPath).doc(rep.id);
      
      // Transformar timestamp strings a Firestore Timestamps
      const docData = {
        codigoSAP: rep.codigoSAP || '',
        codigoBaader: rep.codigoBaader || '',
        textoBreve: rep.textoBreve || '',
        descripcion: rep.descripcion || '',
        nombreManual: rep.nombreManual || '',
        cantidadSolicitada: rep.cantidadSolicitada || 0,
        cantidadStockBodega: rep.cantidadStockBodega || 0,
        valorUnitario: rep.valorUnitario || 0,
        total: rep.total || 0,
        fechaUltimaActualizacionInventario: rep.fechaUltimaActualizacionInventario 
          ? admin.firestore.Timestamp.fromDate(new Date(rep.fechaUltimaActualizacionInventario))
          : null,
        tags: rep.tags || [],
        vinculosManual: rep.vinculosManual || [],
        imagenesManual: rep.imagenesManual || [],
        fotosReales: rep.fotosReales || [],
        createdAt: admin.firestore.Timestamp.fromDate(new Date(rep.createdAt)),
        updatedAt: admin.firestore.Timestamp.fromDate(new Date(rep.updatedAt))
      };
      
      batch.set(docRef, docData);
      batchSize++;
      
      if (batchSize >= BATCH_LIMIT) {
        if (!dryRun) {
          await batch.commit();
          console.log(`  ✓ Batch guardado (${BATCH_LIMIT} repuestos)`);
        } else {
          console.log(`  ✓ [DRY-RUN] Batch lista (${BATCH_LIMIT} repuestos)`);
        }
        importedCount += batchSize;
        batchSize = 0;
      }
    } catch (err) {
      console.error(`  ❌ Error en ${rep.codigoSAP}: ${err.message}`);
      errorCount++;
    }
  }
  
  // Commit final
  if (batchSize > 0) {
    if (!dryRun) {
      await batch.commit();
    }
    importedCount += batchSize;
  }
  
  console.log(`\n  ✅ Repuestos importados: ${importedCount}`);
  if (errorCount > 0) console.log(`  ❌ Errores: ${errorCount}`);
  console.log();
}

// ============================================================
// 3. IMPORTAR MAPAS
// ============================================================

async function importMapsData() {
  if (!importMaps) return;
  
  console.log('🗺️  Importando MAPAS...\n');
  
  const mapsPath = path.join(DEMO_DIR, 'demo_maps.json');
  if (!fs.existsSync(mapsPath)) {
    console.error(`  ❌ Archivo no encontrado: ${mapsPath}`);
    return;
  }
  
  const maps = JSON.parse(fs.readFileSync(mapsPath, 'utf-8'));
  
  let importedCount = 0;
  let markerCount = 0;
  const batch = db.batch();
  
  for (const map of maps) {
    try {
      const docRef = db.collection('plantMaps').doc(map.id);
      
      // Transformar marcadores
      const marcadores = (map.marcadores || []).map(m => ({
        id: m.id,
        x: m.x,
        y: m.y,
        label: m.label,
        assetId: m.assetId,
        type: m.type,
        createdAt: admin.firestore.Timestamp.fromDate(new Date(m.createdAt)),
        updatedAt: admin.firestore.Timestamp.fromDate(new Date(m.updatedAt))
      }));
      
      const docData = {
        nombre: map.nombre,
        descripcion: map.descripcion,
        imageUrl: map.imageUrl,
        orden: map.orden,
        marcadores,
        areas: map.areas || [],
        createdAt: admin.firestore.Timestamp.fromDate(new Date(map.createdAt)),
        updatedAt: admin.firestore.Timestamp.fromDate(new Date(map.updatedAt))
      };
      
      batch.set(docRef, docData);
      importedCount++;
      markerCount += marcadores.length;
      
      console.log(`  ✓ ${map.nombre} (${marcadores.length} marcadores)`);
    } catch (err) {
      console.error(`  ❌ Error en ${map.id}: ${err.message}`);
    }
  }
  
  if (!dryRun) {
    await batch.commit();
  }
  
  console.log(`\n  ✅ Mapas importados: ${importedCount}`);
  console.log(`  📍 Marcadores totales: ${markerCount}`);
  console.log();
}

// ============================================================
// 4. IMPORTAR PLANT ASSETS (desde jerarquía)
// ============================================================

async function importPlantAssets() {
  if (!importAssets) return;
  
  console.log('⚡ Importando PLANT ASSETS...\n');
  
  const hierarchyPath = path.join(__dirname, '..', 'data', 'jerarquia', 'JERARQUIA_COMPLETA_VERIFICADA.json');
  if (!fs.existsSync(hierarchyPath)) {
    console.error(`  ❌ Jerarquía no encontrada: ${hierarchyPath}`);
    return;
  }
  
  const hierarchy = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));
  
  // Extraer motores y bombas
  const allEquipos = [];
  for (const key of Object.keys(hierarchy)) {
    if (key.startsWith('PAGINA_')) {
      const page = hierarchy[key];
      if (page.equipos && Array.isArray(page.equipos)) {
        allEquipos.push(...page.equipos);
      }
    }
  }
  
  const motorsAndPumps = allEquipos.filter(eq => {
    const denom = (eq.denominacion || '').toUpperCase();
    return denom.includes('MOTOR') || denom.includes('BOMBA');
  });
  
  console.log(`  📊 Encontrados ${motorsAndPumps.length} equipos`);
  
  let importedCount = 0;
  let motorCount = 0;
  let bombaCount = 0;
  const batch = db.batch();
  
  for (const equipo of motorsAndPumps) {
    try {
      const denom = (equipo.denominacion || '').toUpperCase();
      const tipo = denom.includes('BOMBA') ? 'bomba' : 'motor';
      const assetId = `asset-${equipo.codigo}`;
      
      const docRef = db.collection('plantAssets').doc(assetId);
      
      const docData = {
        codigo: equipo.codigo,
        denominacion: equipo.denominacion,
        tipo,
        padre: equipo.padre,
        area: extraerArea(equipo.padre),
        marca: extraerMarca(equipo.denominacion),
        modelo: equipo.denominacion,
        descripcion: `${tipo.toUpperCase()} - ${equipo.denominacion}`,
        especificaciones: {
          potencia: null,
          voltaje: null,
          amperaje: null,
          rpm: null
        },
        imagenes: [],
        marcadores: [],
        referencias: [],
        estado: 'operativo',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      };
      
      batch.set(docRef, docData);
      importedCount++;
      
      if (tipo === 'motor') motorCount++;
      else bombaCount++;
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }
  
  if (!dryRun) {
    await batch.commit();
  }
  
  console.log(`  ✅ Assets importados: ${importedCount}`);
  console.log(`     - Motores: ${motorCount}`);
  console.log(`     - Bombas: ${bombaCount}`);
  console.log();
}

function extraerArea(padre) {
  if (!padre) return 'General';
  if (padre.includes('ACOP')) return 'ACOPIO';
  if (padre.includes('PCHO')) return 'PLANTA CHONCHI';
  if (padre.includes('PYAL')) return 'PLANTA YAL';
  if (padre.includes('EXTE')) return 'PATIO Y SERVICIOS';
  return 'General';
}

function extraerMarca(denominacion) {
  const denom = (denominacion || '').toUpperCase();
  if (denom.includes('BAADER')) return 'Baader';
  if (denom.includes('MAREL')) return 'MAREL';
  if (denom.includes('ELECTRICO') || denom.includes('ELEC')) return 'Motoreductor';
  return 'Diverso';
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    await ensureMachines();
    
    if (importRepuestos) await importRepuestosData();
    if (importMaps) await importMapsData();
    if (importAssets) await importPlantAssets();
    
    console.log('='.repeat(70));
    console.log('✅ IMPORTACIÓN COMPLETADA');
    console.log('='.repeat(70));
    
    if (dryRun) {
      console.log('\n⚠️  Modo PRUEBA: No se escribió en la BD');
      console.log('    Para importar realmente: node scripts/import_demo_data.js\n');
    } else {
      console.log('\n✅ Datos importados a Firestore');
      console.log('   Abre la app en: http://localhost:5173\n');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  }
}

main();
