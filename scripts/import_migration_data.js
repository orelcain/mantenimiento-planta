#!/usr/bin/env node
/**
 * Script de Migración: Importar datos a Firestore
 * Ejecuta directamente desde la CLI sin necesidad de Cloud Functions
 * 
 * Requisitos:
 *   1. Tener serviceAccountKey.json en el root del proyecto
 *   2. O tener GOOGLE_APPLICATION_CREDENTIALS configurada
 * 
 * Uso:
 *   node scripts/import_migration_data.js
 * 
 * Para testear conexión:
 *   node scripts/import_migration_data.js --test
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Parsear argumentos
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const isDryRun = args.includes('--dry-run');

console.log('\n' + '='.repeat(60));
console.log('📦 IMPORTADOR DE DATOS DE MIGRACIÓN');
console.log('='.repeat(60));

// ============================================================
// 1. Inicializar Firebase Admin
// ============================================================
try {
  // Buscar serviceAccountKey.json
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  
  let config;
  if (fs.existsSync(serviceAccountPath)) {
    config = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    console.log('✅ serviceAccountKey.json encontrada');
  } else {
    console.log('⚠️  serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS');
    // Firebase Admin intentará usar variables de entorno
  }

  if (!admin.apps.length) {
    if (config) {
      admin.initializeApp({
        credential: admin.credential.cert(config),
        databaseURL: config.databaseURL || undefined
      });
    } else {
      admin.initializeApp();
    }
  }
  
  console.log('✅ Firebase Admin inicializado\n');
} catch (err) {
  console.error('❌ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

// ============================================================
// 2. Test de conexión
// ============================================================
async function testConnection() {
  console.log('🔍 Testando conexión a Firestore...\n');
  try {
    const snapshot = await db.collection('machines').limit(1).get();
    console.log('✅ Conexión exitosa');
    console.log(`   - Base de datos: ${snapshot.query._path.collectionPath}`);
    console.log(`   - Documentos en machines: ${snapshot.size}\n`);
    return true;
  } catch (err) {
    console.error('❌ Error de conexión:', err.message, '\n');
    return false;
  }
}

// ============================================================
// 3. Funciones de importación
// ============================================================

/**
 * Importar máquinas desde JSON
 */
async function importMachines() {
  console.log('📋 [PASO 1] Importando máquinas...\n');
  
  try {
    const machinesPath = path.join(__dirname, '..', 'output', 'machines.json');
    
    if (!fs.existsSync(machinesPath)) {
      console.log('⚠️  Archivo machines.json no encontrado');
      console.log(`   Ejecuta primero: node scripts/generate_migration_data.js\n`);
      return { imported: 0, skipped: 0, error: 'File not found' };
    }

    const machines = JSON.parse(fs.readFileSync(machinesPath, 'utf-8'));
    let importedCount = 0;
    let skippedCount = 0;

    for (const machine of machines) {
      try {
        const docRef = db.collection('machines').doc(machine.id);
        const doc = await docRef.get();

        if (isDryRun) {
          console.log(`  ✓ [DRY-RUN] ${machine.nombre}`);
          importedCount++;
        } else {
          if (doc.exists) {
            console.log(`  ℹ️  Existente: ${machine.nombre}`);
            skippedCount++;
          } else {
            await docRef.set({
              ...machine,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now()
            });
            console.log(`  ✅ ${machine.nombre}`);
            importedCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ ${machine.nombre}:`, err.message);
      }
    }

    console.log(`\n✅ Máquinas: ${importedCount} importadas, ${skippedCount} saltadas\n`);
    return { imported: importedCount, skipped: skippedCount, total: machines.length };
  } catch (err) {
    console.error('❌ Error importando máquinas:', err.message, '\n');
    return { imported: 0, skipped: 0, error: err.message };
  }
}

/**
 * Importar PlantAssets desde JSON
 */
async function importPlantAssets() {
  console.log('⚙️  [PASO 2] Importando PlantAssets (motores/bombas)...\n');
  
  try {
    const assetsPath = path.join(__dirname, '..', 'output', 'plant_assets.json');
    
    if (!fs.existsSync(assetsPath)) {
      console.log('⚠️  Archivo plant_assets.json no encontrado\n');
      return { imported: 0, skipped: 0, error: 'File not found' };
    }

    const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf-8'));
    let importedCount = 0;
    let skippedCount = 0;

    for (const asset of assets) {
      try {
        const docRef = db.collection('plantAssets').doc(asset.id);
        const doc = await docRef.get();

        if (isDryRun) {
          console.log(`  ✓ [DRY-RUN] ${asset.tipo}: ${asset.denominacion}`);
          importedCount++;
        } else {
          if (doc.exists) {
            console.log(`  ℹ️  Existente: ${asset.codigo}`);
            skippedCount++;
          } else {
            await docRef.set({
              ...asset,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now()
            });
            console.log(`  ✅ ${asset.tipo}: ${asset.denominacion}`);
            importedCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ ${asset.codigo}:`, err.message);
      }
    }

    console.log(`\n✅ PlantAssets: ${importedCount} importados, ${skippedCount} saltados\n`);
    return { imported: importedCount, skipped: skippedCount, total: assets.length };
  } catch (err) {
    console.error('❌ Error importando PlantAssets:', err.message, '\n');
    return { imported: 0, skipped: 0, error: err.message };
  }
}

/**
 * Migrar repuestos de Baader 200
 */
async function migrateRepuestos() {
  console.log('📦 [PASO 3] Migrando repuestos de Baader 200...\n');
  
  try {
    const legacyCollection = db.collection('repuestosBaader200');
    const legacySnapshot = await legacyCollection.get();
    
    console.log(`  📄 Encontrados ${legacySnapshot.size} repuestos legacy\n`);

    if (legacySnapshot.size === 0) {
      console.log(`  ℹ️  No hay repuestos para migrar\n`);
      return { migrated: 0, skipped: 0, total: 0 };
    }

    let migratedCount = 0;
    let skippedCount = 0;
    const newCollection = db.collection('machines/baader-200/repuestos');

    for (const legacyDoc of legacySnapshot.docs) {
      try {
        const legacyData = legacyDoc.data();
        const docRef = newCollection.doc(legacyDoc.id);
        const doc = await docRef.get();

        if (isDryRun) {
          console.log(`  ✓ [DRY-RUN] ${legacyData.codigoSAP || legacyDoc.id}`);
          migratedCount++;
        } else {
          if (doc.exists) {
            console.log(`  ℹ️  Existente: ${legacyData.codigoSAP || legacyDoc.id}`);
            skippedCount++;
          } else {
            await docRef.set(legacyData);
            console.log(`  ✅ ${legacyData.codigoSAP || legacyDoc.id}`);
            migratedCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ Error:`, err.message);
      }
    }

    console.log(`\n✅ Repuestos: ${migratedCount} migrados, ${skippedCount} saltados\n`);
    return { migrated: migratedCount, skipped: skippedCount, total: legacySnapshot.size };
  } catch (err) {
    console.error('❌ Error migrando repuestos:', err.message, '\n');
    return { migrated: 0, skipped: 0, error: err.message };
  }
}

// ============================================================
// 4. Main
// ============================================================
async function main() {
  try {
    // Test de conexión
    const isConnected = await testConnection();
    
    if (!isConnected && !isTest) {
      console.log('⚠️  No se pudo conectar a Firestore');
      console.log('   Verifica que serviceAccountKey.json esté presente\n');
      process.exit(1);
    }

    if (isTest) {
      console.log('✅ Test completado\n');
      process.exit(0);
    }

    // Ejecutar importaciones
    const machinesResult = await importMachines();
    const assetsResult = await importPlantAssets();
    const repuestosResult = await migrateRepuestos();

    // Resumen
    console.log('='.repeat(60));
    console.log('📊 RESUMEN DE IMPORTACIÓN');
    console.log('='.repeat(60) + '\n');
    console.log(`✅ Máquinas: ${machinesResult.imported}/${machinesResult.total} importadas (${machinesResult.skipped} saltadas)`);
    console.log(`✅ PlantAssets: ${assetsResult.imported}/${assetsResult.total} importados (${assetsResult.skipped} saltados)`);
    console.log(`✅ Repuestos: ${repuestosResult.migrated}/${repuestosResult.total} migrados (${repuestosResult.skipped} saltados)`);

    if (isDryRun) {
      console.log('\n⚠️  MODO DRY-RUN: No se escribió en Firestore');
      console.log('Ejecuta sin --dry-run para aplicar los cambios\n');
    } else {
      console.log('\n✅ ¡Importación completada exitosamente!\n');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  }
}

main();
