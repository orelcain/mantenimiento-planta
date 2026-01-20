#!/usr/bin/env node
/**
 * Script para crear repuestos reales y completos por máquina
 * Simula la estructura de datos de la otra app (Repuestos-App)
 * 
 * Uso:
 *   node scripts/populate_repuestos.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Repuestos por máquina (estructura compatible con la app anterior)
const REPUESTOS_DATA = {
  'baader-200': [
    {
      codigoSAP: '4500001',
      textoBreve: 'Cuchilla principal de filete',
      descripcion: 'Cuchilla de acero inoxidable para fileteo principal',
      cantidad: 2,
      cantidadMinima: 1,
      costo: 45000,
      proveedor: 'Baader',
      tags: [
        { nombre: 'CRITICO', color: '#ef4444', tipo: 'solicitud', cantidad: 1 },
        { nombre: 'CONSUMIBLE', color: '#f59e0b', tipo: 'stock', cantidad: 1 }
      ]
    },
    {
      codigoSAP: '4500002',
      textoBreve: 'Rodamiento SKF 6205',
      descripcion: 'Rodamiento de bolas de precisión para rodillos de transporte',
      cantidad: 5,
      cantidadMinima: 2,
      costo: 28500,
      proveedor: 'SKF',
      tags: [
        { nombre: 'REPUESTO', color: '#3b82f6', tipo: 'stock', cantidad: 3 },
        { nombre: 'IMPORTADO', color: '#8b5cf6', tipo: 'stock', cantidad: 2 }
      ]
    },
    {
      codigoSAP: '4500003',
      textoBreve: 'Correa transportadora',
      descripcion: 'Correa de goma para sistema de transporte de peces',
      cantidad: 1,
      cantidadMinima: 1,
      costo: 125000,
      proveedor: 'Gates',
      tags: [
        { nombre: 'CRITICO', color: '#ef4444', tipo: 'solicitud', cantidad: 1 }
      ]
    },
    {
      codigoSAP: '4500004',
      textoBreve: 'Motor eléctrico 5.5 kW',
      descripcion: 'Motor trifásico para accionamiento de rodillos',
      cantidad: 1,
      cantidadMinima: 0,
      costo: 250000,
      proveedor: 'WEG',
      tags: [
        { nombre: 'CRITICO', color: '#ef4444', tipo: 'solicitud', cantidad: 1 }
      ]
    },
    {
      codigoSAP: '4500005',
      textoBreve: 'Sensor óptico de peces',
      descripcion: 'Sensor para detección de presencia de peces',
      cantidad: 2,
      cantidadMinima: 1,
      costo: 85000,
      proveedor: 'Baader',
      tags: [
        { nombre: 'AUTOMATIZACION', color: '#06b6d4', tipo: 'stock', cantidad: 2 }
      ]
    },
    {
      codigoSAP: '4500006',
      textoBreve: 'Kit de mantención (aceite, grasas)',
      descripcion: 'Conjunto de lubricantes para mantención semanal',
      cantidad: 10,
      cantidadMinima: 3,
      costo: 35000,
      proveedor: 'Shell',
      tags: [
        { nombre: 'CONSUMIBLE', color: '#f59e0b', tipo: 'stock', cantidad: 10 }
      ]
    }
  ],
  'fishken': [
    {
      codigoSAP: '4600001',
      textoBreve: 'Filtro de agua',
      descripcion: 'Filtro de cartucho para sistema de agua de Fishken',
      cantidad: 3,
      cantidadMinima: 1,
      costo: 15000,
      proveedor: 'Fishken',
      tags: [
        { nombre: 'CONSUMIBLE', color: '#f59e0b', tipo: 'stock', cantidad: 3 }
      ]
    },
    {
      codigoSAP: '4600002',
      textoBreve: 'Válvula solenoide 24V',
      descripcion: 'Válvula de control para sistema de agua',
      cantidad: 2,
      cantidadMinima: 1,
      costo: 45000,
      proveedor: 'Fishken',
      tags: [
        { nombre: 'REPUESTO', color: '#3b82f6', tipo: 'stock', cantidad: 1 },
        { nombre: 'AUTOMATIZACION', color: '#06b6d4', tipo: 'solicitud', cantidad: 1 }
      ]
    },
    {
      codigoSAP: '4600003',
      textoBreve: 'Sensor de flujo',
      descripcion: 'Sensor para monitoreo de caudal de agua',
      cantidad: 1,
      cantidadMinima: 1,
      costo: 78000,
      proveedor: 'Fishken',
      tags: [
        { nombre: 'AUTOMATIZACION', color: '#06b6d4', tipo: 'solicitud', cantidad: 1 }
      ]
    }
  ],
  'grader': [
    {
      codigoSAP: '4700001',
      textoBreve: 'Sensor óptico de tamaño',
      descripcion: 'Sensor para clasificación de tamaño de filete',
      cantidad: 1,
      cantidadMinima: 1,
      costo: 95000,
      proveedor: 'MAREL',
      tags: [
        { nombre: 'CRITICO', color: '#ef4444', tipo: 'solicitud', cantidad: 1 }
      ]
    },
    {
      codigoSAP: '4700002',
      textoBreve: 'Compuerta de desviación',
      descripcion: 'Compuerta para dirigir peces a diferentes canales',
      cantidad: 6,
      cantidadMinima: 1,
      costo: 35000,
      proveedor: 'MAREL',
      tags: [
        { nombre: 'REPUESTO', color: '#3b82f6', tipo: 'stock', cantidad: 3 },
        { nombre: 'CONSUMIBLE', color: '#f59e0b', tipo: 'solicitud', cantidad: 3 }
      ]
    }
  ]
};

async function populateRepuestos() {
  console.log('\n📦 Poblando repuestos por máquina...\n');
  
  let totalCreated = 0;
  let totalSkipped = 0;
  
  for (const [machineId, repuestos] of Object.entries(REPUESTOS_DATA)) {
    console.log(`\n🔧 Máquina: ${machineId}`);
    
    try {
      const collection = db.collection(`machines/${machineId}/repuestos`);
      
      for (const repData of repuestos) {
        try {
          // Crear ID único basado en codigoSAP
          const repId = repData.codigoSAP.toLowerCase();
          const existingDoc = await collection.doc(repId).get();
          
          if (existingDoc.exists) {
            console.log(`  ℹ️  Existente: ${repData.codigoSAP} - ${repData.textoBreve}`);
            totalSkipped++;
          } else {
            const repuesto = {
              ...repData,
              fotosManual: [],
              fotosReales: [],
              vinculosManual: [],
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now()
            };
            
            await collection.doc(repId).set(repuesto);
            console.log(`  ✅ Creado: ${repData.codigoSAP} - ${repData.textoBreve}`);
            totalCreated++;
          }
        } catch (err) {
          console.error(`  ❌ Error con ${repData.codigoSAP}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`  ❌ Error en máquina ${machineId}:`, err.message);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RESUMEN');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Creados: ${totalCreated}`);
  console.log(`ℹ️  Existentes: ${totalSkipped}`);
  console.log(`📦 Total: ${totalCreated + totalSkipped}\n`);
}

async function main() {
  try {
    await populateRepuestos();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  }
}

main();
