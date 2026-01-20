#!/usr/bin/env node
/**
 * Script de Migración: Máquinas y Repuestos
 * ==========================================
 * Migra todas las máquinas y repuestos a la nueva estructura:
 * 1. Crea documentos en 'machines' collection (excluyendo jerarquía)
 * 2. Migra repuestos de 'repuestosBaader200' a 'machines/baader-200/repuestos'
 * 3. Registra motores/bombas de la jerarquía como PlantAssets
 * 
 * Uso:
 *   node scripts/migrate_machines_and_assets.js
 *   node scripts/migrate_machines_and_assets.js --dry-run
 * 
 * Requisitos:
 *   - GOOGLE_APPLICATION_CREDENTIALS configurada
 *   - data/jerarquia/JERARQUIA_COMPLETA_VERIFICADA.json disponible
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Parsear argumentos
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

console.log(`\n${'='.repeat(60)}`);
console.log('🚀 Iniciando Migración de Máquinas y Repuestos');
console.log(`${'='.repeat(60)}`);
if (isDryRun) console.log('⚠️  MODO DRY-RUN (sin escribir en Firestore)');
console.log();

// Inicializar Firebase Admin
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase Admin:', err.message);
  process.exit(1);
}

const db = admin.firestore();

/**
 * PASO 1: Crear máquinas desde la jerarquía
 * Se crean documentos en 'machines' con ID basado en nombre normalizado
 */
async function migrateMachines() {
  console.log('\n📋 [PASO 1] Migrando máquinas...');
  
  // Máquinas a crear (nombre, marca, modelo, descripción)
  const machinesData = [
    {
      id: 'baader-200',
      nombre: 'Baader 200',
      marca: 'Baader',
      modelo: '200',
      descripcion: 'Máquina principal - Fileteadora Baader 200',
      activa: true,
      color: '#3b82f6',
      orden: 0
    },
    {
      id: 'cinta-esquelones',
      nombre: 'Cinta Esquelones',
      marca: 'Desconocido',
      modelo: 'Cinta',
      descripcion: 'Cinta de transporte para esquelones',
      activa: true,
      color: '#8b5cf6',
      orden: 1
    },
    {
      id: 'cinta-salida-filete',
      nombre: 'Cinta Salida Filete',
      marca: 'Desconocido',
      modelo: 'Cinta',
      descripcion: 'Cinta de salida para filetes',
      activa: true,
      color: '#ec4899',
      orden: 2
    },
    {
      id: 'balanza-dinamica-marel',
      nombre: 'Balanza Dinámica MAREL',
      marca: 'MAREL',
      modelo: 'Balanza Dinámica',
      descripcion: 'Sistema de pesaje dinámico',
      activa: true,
      color: '#06b6d4',
      orden: 3
    },
    {
      id: 'cinta-aceleracion-marel',
      nombre: 'Cinta Aceleración MAREL',
      marca: 'MAREL',
      modelo: 'Cinta',
      descripcion: 'Cinta de aceleración para MAREL',
      activa: true,
      color: '#10b981',
      orden: 4
    },
    {
      id: 'cinta-alimentacion-baader',
      nombre: 'Cinta Alimentación Baader',
      marca: 'Baader',
      modelo: 'Cinta',
      descripcion: 'Cinta de alimentación para Baader 200',
      activa: true,
      color: '#f59e0b',
      orden: 5
    },
    {
      id: 'volcador-bins',
      nombre: 'Volcador Bins',
      marca: 'Baader',
      modelo: 'Volcador',
      descripcion: 'Sistema de volcado de bins',
      activa: true,
      color: '#ef4444',
      orden: 6
    },
    {
      id: 'sistema-bombeo-peces-n1',
      nombre: 'Sistema Bombeo Peces N1',
      marca: 'Diversas',
      modelo: 'Sistema',
      descripcion: 'Sistema de bombeo de peces N1',
      activa: true,
      color: '#6366f1',
      orden: 7
    },
    {
      id: 'sistema-bombeo-peces-n2',
      nombre: 'Sistema Bombeo Peces N2',
      marca: 'Diversas',
      modelo: 'Sistema',
      descripcion: 'Sistema de bombeo de peces N2',
      activa: true,
      color: '#a855f7',
      orden: 8
    }
  ];

  let createdCount = 0;
  
  for (const machineData of machinesData) {
    try {
      if (isDryRun) {
        console.log(`  ✓ [DRY-RUN] Máquina: ${machineData.nombre} (${machineData.id})`);
        createdCount++;
      } else {
        const docRef = db.collection('machines').doc(machineData.id);
        const doc = await docRef.get();
        
        if (doc.exists) {
          console.log(`  ℹ️  Máquina existente: ${machineData.nombre} (id: ${machineData.id})`);
        } else {
          await docRef.set({
            ...machineData,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          });
          console.log(`  ✅ Creada: ${machineData.nombre}`);
          createdCount++;
        }
      }
    } catch (err) {
      console.error(`  ❌ Error con ${machineData.nombre}:`, err.message);
    }
  }
  
  console.log(`\n✅ Máquinas: ${createdCount}/${machinesData.length} procesadas`);
  return createdCount;
}

/**
 * PASO 2: Migrar repuestos de Baader 200
 * Copia datos de 'repuestosBaader200' a 'machines/baader-200/repuestos'
 */
async function migrateRepuestos() {
  console.log('\n📦 [PASO 2] Migrando repuestos de Baader 200...');
  
  try {
    const legacyCollection = db.collection('repuestosBaader200');
    const newCollection = db.collection('machines/baader-200/repuestos');
    
    // Obtener documentos legacy
    const legacySnapshot = await legacyCollection.get();
    console.log(`  📄 Encontrados ${legacySnapshot.size} repuestos legacy`);
    
    if (legacySnapshot.size === 0) {
      console.log(`  ℹ️  No hay repuestos legacy para migrar`);
      return 0;
    }
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const legacyDoc of legacySnapshot.docs) {
      try {
        const legacyData = legacyDoc.data();
        
        if (isDryRun) {
          console.log(`  ✓ [DRY-RUN] SAP: ${legacyData.codigoSAP || 'N/A'}`);
          migratedCount++;
        } else {
          // Verificar si ya existe
          const existingDoc = await newCollection.doc(legacyDoc.id).get();
          
          if (existingDoc.exists) {
            console.log(`  ℹ️  Repuesto existente: ${legacyData.codigoSAP || legacyDoc.id}`);
            skippedCount++;
          } else {
            // Copiar documento
            await newCollection.doc(legacyDoc.id).set(legacyData);
            console.log(`  ✅ Migrado: ${legacyData.codigoSAP || legacyDoc.id}`);
            migratedCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ Error migrando repuesto:`, err.message);
      }
    }
    
    console.log(`\n✅ Repuestos: ${migratedCount} migrados, ${skippedCount} saltados`);
    return migratedCount;
  } catch (err) {
    console.error('❌ Error en migración de repuestos:', err.message);
    return 0;
  }
}

/**
 * PASO 3: Registrar motores/bombas como PlantAssets
 * Lee la jerarquía y crea assets de tipo 'motor' o 'bomba'
 */
async function migratePlantAssets() {
  console.log('\n⚙️  [PASO 3] Registrando motores/bombas como PlantAssets...');
  
  try {
    // Leer archivo de jerarquía
    const hierarchyPath = path.join(
      __dirname,
      '..',
      'data',
      'jerarquia',
      'JERARQUIA_COMPLETA_VERIFICADA.json'
    );
    
    if (!fs.existsSync(hierarchyPath)) {
      console.log(`  ⚠️  Archivo de jerarquía no encontrado: ${hierarchyPath}`);
      return 0;
    }
    
    const hierarchyData = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));
    
    // Extraer todos los equipos
    const allEquipos = [];
    for (const key of Object.keys(hierarchyData)) {
      if (key.startsWith('PAGINA_')) {
        const page = hierarchyData[key];
        if (page.equipos && Array.isArray(page.equipos)) {
          allEquipos.push(...page.equipos);
        }
      }
    }
    
    console.log(`  📄 Encontrados ${allEquipos.length} equipos en la jerarquía`);
    
    // Filtrar motores y bombas
    const motorsAndPumps = allEquipos.filter(eq => {
      const denom = (eq.denominacion || '').toUpperCase();
      return denom.includes('MOTOR') || denom.includes('BOMBA');
    });
    
    console.log(`  🔍 Identificados ${motorsAndPumps.length} motores/bombas`);
    
    const assetsCollection = db.collection('plantAssets');
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const equipo of motorsAndPumps) {
      try {
        const denom = (equipo.denominacion || '').toUpperCase();
        const tipo = denom.includes('BOMBA') ? 'bomba' : 'motor';
        
        const assetId = `asset-${equipo.codigo}`;
        
        if (isDryRun) {
          console.log(`  ✓ [DRY-RUN] ${tipo.toUpperCase()}: ${equipo.denominacion} (${equipo.codigo})`);
          createdCount++;
        } else {
          const existingDoc = await assetsCollection.doc(assetId).get();
          
          if (existingDoc.exists) {
            console.log(`  ℹ️  Asset existente: ${equipo.codigo}`);
            skippedCount++;
          } else {
            const assetData = {
              codigo: equipo.codigo,
              denominacion: equipo.denominacion,
              tipo: tipo,
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
            
            await assetsCollection.doc(assetId).set(assetData);
            console.log(`  ✅ Registrado: ${equipo.denominacion}`);
            createdCount++;
          }
        }
      } catch (err) {
        console.error(`  ❌ Error registrando asset:`, err.message);
      }
    }
    
    console.log(`\n✅ PlantAssets: ${createdCount} creados, ${skippedCount} saltados`);
    return createdCount;
  } catch (err) {
    console.error('❌ Error en migración de PlantAssets:', err.message);
    return 0;
  }
}

/**
 * Utilidades
 */
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

/**
 * Main
 */
async function main() {
  try {
    // Ejecutar migraciones
    const machines = await migrateMachines();
    const repuestos = await migrateRepuestos();
    const assets = await migratePlantAssets();
    
    // Resumen
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Máquinas: ${machines} procesadas`);
    console.log(`✅ Repuestos: ${repuestos} migrados`);
    console.log(`✅ PlantAssets: ${assets} registrados`);
    
    if (isDryRun) {
      console.log('\n⚠️  MODO DRY-RUN: No se escribió en Firestore');
      console.log('Ejecuta sin --dry-run para aplicar los cambios\n');
    } else {
      console.log('\n✅ ¡Migración completada exitosamente!\n');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  }
}

main();
