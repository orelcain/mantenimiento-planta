/**
 * Cloud Function: Migrar Máquinas y Repuestos
 * Ejecutar manualmente desde Firebase Console como función HTTP
 * 
 * Deploy:
 *   firebase deploy --only functions:migrateDataV1
 * 
 * Uso:
 *   POST https://REGION-PROJECT_ID.cloudfunctions.net/migrateDataV1
 *   Headers: Authorization: Bearer <firebase_token>
 *   Body: { "action": "all" | "machines" | "assets" | "repuestos" }
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Crear máquinas
 */
async function createMachines() {
  const machines = [
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
  const batch = db.batch();

  for (const machine of machines) {
    const docRef = db.collection('machines').doc(machine.id);
    batch.set(docRef, {
      ...machine,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    createdCount++;
  }

  await batch.commit();
  return { created: createdCount, type: 'machines' };
}

/**
 * Crear Plant Assets
 */
async function createPlantAssets(hierarchyData) {
  const motorsAndPumps = [];
  
  // Extraer equipos de la jerarquía
  for (const key of Object.keys(hierarchyData)) {
    if (key.startsWith('PAGINA_')) {
      const page = hierarchyData[key];
      if (page.equipos && Array.isArray(page.equipos)) {
        const filtered = page.equipos.filter(eq => {
          const denom = (eq.denominacion || '').toUpperCase();
          return denom.includes('MOTOR') || denom.includes('BOMBA');
        });
        motorsAndPumps.push(...filtered);
      }
    }
  }

  let createdCount = 0;
  const batch = db.batch();

  for (const equipo of motorsAndPumps) {
    const denom = (equipo.denominacion || '').toUpperCase();
    const tipo = denom.includes('BOMBA') ? 'bomba' : 'motor';
    const assetId = `asset-${equipo.codigo}`;

    const docRef = db.collection('plantAssets').doc(assetId);
    batch.set(docRef, {
      codigo: equipo.codigo,
      denominacion: equipo.denominacion,
      tipo: tipo,
      padre: equipo.padre,
      area: extractArea(equipo.padre),
      marca: extractMarca(equipo.denominacion),
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
    }, { merge: true });
    createdCount++;
  }

  await batch.commit();
  return { created: createdCount, type: 'plantAssets', total: motorsAndPumps.length };
}

/**
 * Migrar repuestos de Baader 200
 */
async function migrateRepuestos() {
  try {
    const legacyCollection = db.collection('repuestosBaader200');
    const newCollection = db.collection('machines/baader-200/repuestos');

    const legacySnapshot = await legacyCollection.get();
    let migratedCount = 0;

    for (const legacyDoc of legacySnapshot.docs) {
      const legacyData = legacyDoc.data();
      const existingDoc = await newCollection.doc(legacyDoc.id).get();

      if (!existingDoc.exists) {
        await newCollection.doc(legacyDoc.id).set(legacyData);
        migratedCount++;
      }
    }

    return { migrated: migratedCount, type: 'repuestos', total: legacySnapshot.size };
  } catch (err) {
    console.error('Error migrando repuestos:', err);
    return { migrated: 0, type: 'repuestos', error: err.message };
  }
}

/**
 * Funciones auxiliares
 */
function extractArea(padre) {
  if (!padre) return 'General';
  if (padre.includes('ACOP')) return 'ACOPIO';
  if (padre.includes('PCHO')) return 'PLANTA CHONCHI';
  if (padre.includes('PYAL')) return 'PLANTA YAL';
  if (padre.includes('EXTE')) return 'PATIO Y SERVICIOS';
  return 'General';
}

function extractMarca(denominacion) {
  const denom = (denominacion || '').toUpperCase();
  if (denom.includes('BAADER')) return 'Baader';
  if (denom.includes('MAREL')) return 'MAREL';
  if (denom.includes('ELECTRICO') || denom.includes('ELEC')) return 'Motoreductor';
  return 'Diverso';
}

/**
 * Función HTTP para ejecutar migración
 */
exports.migrateDataV1 = functions.https.onRequest(async (req, res) => {
  // Verificar autenticación
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const action = req.body?.action || 'all';
    const results = {};

    console.log(`[MIGRATION] Starting action: ${action}`);

    // Leer archivo de jerarquía (puede no estar disponible en Cloud Function)
    let hierarchyData = null;
    try {
      // En Cloud Functions esto no funcionará - usar datos hardcoded o leer desde Storage
      const hierarchyFile = require('../data/jerarquia/JERARQUIA_COMPLETA_VERIFICADA.json');
      hierarchyData = hierarchyFile;
    } catch (err) {
      console.warn('Jerarquía no disponible en Cloud Function, usando datos hardcoded');
    }

    if (action === 'all' || action === 'machines') {
      results.machines = await createMachines();
      console.log(`✅ Máquinas: ${results.machines.created} creadas`);
    }

    if (action === 'all' || action === 'assets') {
      if (hierarchyData) {
        results.assets = await createPlantAssets(hierarchyData);
        console.log(`✅ PlantAssets: ${results.assets.created} creados`);
      } else {
        results.assets = { error: 'Jerarquía no disponible' };
      }
    }

    if (action === 'all' || action === 'repuestos') {
      results.repuestos = await migrateRepuestos();
      console.log(`✅ Repuestos: ${results.repuestos.migrated} migrados`);
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({
      error: 'Migration failed',
      message: err.message
    });
  }
});
