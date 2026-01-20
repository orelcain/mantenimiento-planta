/**
 * Script de prueba para verificar la configuración antes de la migración real
 * Crea 3 repuestos de ejemplo en cada máquina
 */

import * as admin from 'firebase-admin'

const serviceAccount = require('../serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

const REPUESTOS_EJEMPLO = {
  'baader-200': [
    {
      codigoSAP: 'TEST-001',
      textoBreve: 'Cuchilla principal',
      descripcion: 'Cuchilla de corte para fileteadora Baader 200',
      codigoBaader: 'BD200-CU-01',
      cantidadSolicitada: 5,
      cantidadStockBodega: 10,
      valorUnitario: 25000,
      tags: [
        { nombre: 'Overhaul 2024', tipo: 'solicitud', cantidad: 5, fecha: new Date() },
        { nombre: 'Stock mínimo', tipo: 'stock', cantidad: 10, fecha: new Date() }
      ],
      vinculosManual: [
        {
          pdfUrl: 'https://example.com/manual-baader.pdf',
          pagina: 15,
          coordenadas: { x: 0.2, y: 0.3, width: 0.3, height: 0.15 },
          forma: 'rectangulo',
          color: '#3b82f6',
          descripcion: 'Ubicación de la cuchilla en el diagrama',
        }
      ],
      imagenesManual: [],
      fotosReales: [],
    },
    {
      codigoSAP: 'TEST-002',
      textoBreve: 'Rodamiento SKF 6205',
      descripcion: 'Rodamiento para eje principal',
      codigoBaader: 'BD200-ROD-05',
      cantidadSolicitada: 2,
      cantidadStockBodega: 15,
      valorUnitario: 8500,
      tags: [
        { nombre: 'Urgentes', tipo: 'solicitud', cantidad: 2, fecha: new Date() },
        { nombre: 'Stock bodega', tipo: 'stock', cantidad: 15, fecha: new Date() }
      ],
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
    },
    {
      codigoSAP: 'TEST-003',
      textoBreve: 'Correa transportadora',
      descripcion: 'Correa de transporte de producto',
      codigoBaader: 'BD200-COR-12',
      cantidadSolicitada: 0,
      cantidadStockBodega: 3,
      valorUnitario: 45000,
      tags: [
        { nombre: 'Stock bodega', tipo: 'stock', cantidad: 3, fecha: new Date() }
      ],
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
    },
  ],
  'fishken': [
    {
      codigoSAP: 'TEST-FK-001',
      textoBreve: 'Filtro de agua',
      descripcion: 'Filtro principal del sistema de agua',
      codigoBaader: 'FK-FIL-01',
      cantidadSolicitada: 3,
      cantidadStockBodega: 5,
      valorUnitario: 15000,
      tags: [
        { nombre: 'Críticos', tipo: 'solicitud', cantidad: 3, fecha: new Date() },
        { nombre: 'Stock bodega', tipo: 'stock', cantidad: 5, fecha: new Date() }
      ],
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
    },
  ],
  'grader': [
    {
      codigoSAP: 'TEST-GR-001',
      textoBreve: 'Sensor óptico',
      descripcion: 'Sensor de clasificación óptica',
      codigoBaader: 'GR-SEN-03',
      cantidadSolicitada: 1,
      cantidadStockBodega: 2,
      valorUnitario: 120000,
      tags: [
        { nombre: 'Urgentes', tipo: 'solicitud', cantidad: 1, fecha: new Date() },
        { nombre: 'Stock mínimo', tipo: 'stock', cantidad: 2, fecha: new Date() }
      ],
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
    },
  ],
}

async function main() {
  console.log('🧪 Creando repuestos de prueba...\n')
  
  try {
    for (const [machineId, repuestos] of Object.entries(REPUESTOS_EJEMPLO)) {
      console.log(`📦 ${machineId}:`)
      
      for (const rep of repuestos) {
        const repId = db.collection('machines').doc(machineId).collection('repuestos').doc().id
        
        await db.collection('machines').doc(machineId).collection('repuestos').doc(repId).set({
          id: repId,
          ...rep,
          total: rep.cantidadSolicitada + rep.cantidadStockBodega,
          fechaUltimaActualizacionInventario: null,
          nombreManual: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        
        console.log(`  ✅ ${rep.codigoSAP} - ${rep.textoBreve}`)
      }
    }
    
    console.log('\n✨ Repuestos de prueba creados exitosamente!')
    console.log('\n💡 Abre http://localhost:5173/repuestos para verlos')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error no capturado:', error)
    process.exit(1)
  })
