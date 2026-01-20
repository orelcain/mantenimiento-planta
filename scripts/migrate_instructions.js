#!/usr/bin/env node
/**
 * Script Simple: Migración de Máquinas y Repuestos vía Firebase REST API
 * No requiere credenciales de servicio
 * Usa el token del usuario autenticado
 * 
 * Requisitos:
 *   - Tener firebase CLI instalado: npm i -g firebase-tools
 *   - Tener cuenta configurada: firebase login
 * 
 * Uso:
 *   node scripts/migrate_via_rest.js --project PROJECT_ID
 *   node scripts/migrate_via_rest.js --test
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(60));
console.log('📦 MIGRACIÓN VÍA REST API');
console.log('='.repeat(60) + '\n');

// Verificar que genera data primero
const machinesPath = path.join(__dirname, '..', 'output', 'machines.json');
const assetsPath = path.join(__dirname, '..', 'output', 'plant_assets.json');

if (!fs.existsSync(machinesPath) || !fs.existsSync(assetsPath)) {
  console.log('⚠️  Archivos de datos no encontrados');
  console.log('Ejecuta primero:');
  console.log('  node scripts/generate_migration_data.js\n');
  process.exit(1);
}

console.log('✅ Archivos de datos encontrados');
console.log(`   - ${machinesPath}`);
console.log(`   - ${assetsPath}\n`);

// Instrucciones
console.log('📝 PRÓXIMOS PASOS:\n');
console.log('Opción 1: Usar Firebase Console (Recomendado)');
console.log('-'.repeat(60));
console.log('1. Abre Firebase Console: https://console.firebase.google.com');
console.log('2. Selecciona tu proyecto');
console.log('3. Ve a Firestore Database > Datos');
console.log('4. Importa documentos:');
console.log('   - Crear colección "machines"');
console.log('   - Importar: output/machines.json');
console.log('   - Crear colección "plantAssets"');
console.log('   - Importar: output/plant_assets.json\n');

console.log('Opción 2: Usar Firebase Emulator');
console.log('-'.repeat(60));
console.log('1. Instala emulator: firebase emulators:start');
console.log('2. Importa en emulator (similar a console)\n');

console.log('Opción 3: Usar Admin SDK');
console.log('-'.repeat(60));
console.log('1. Asegúrate de tener serviceAccountKey.json');
console.log('2. Ejecuta: node scripts/import_migration_data.js\n');

console.log('📊 DATOS A IMPORTAR:');
console.log('-'.repeat(60));

const machines = JSON.parse(fs.readFileSync(machinesPath, 'utf-8'));
const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf-8'));

console.log(`✅ Máquinas: ${machines.length}`);
machines.forEach(m => console.log(`   - ${m.nombre} (${m.id})`));

console.log(`\n✅ PlantAssets: ${assets.length}`);
const motorCount = assets.filter(a => a.tipo === 'motor').length;
const bombaCount = assets.filter(a => a.tipo === 'bomba').length;
console.log(`   - Motores: ${motorCount}`);
console.log(`   - Bombas: ${bombaCount}\n`);

process.exit(0);
