/**
 * Script para crear categorías iniciales de máquinas
 * 
 * Ejecutar con: node scripts/create-machine-categories.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Categorías iniciales sugeridas
const INITIAL_CATEGORIES = [
  {
    id: 'maquinas-principales',
    nombre: 'Máquinas Principales',
    descripcion: 'Equipos principales de producción: Baader, OBM, Trimadoras, etc.',
    icono: 'Factory',
    orden: 0,
    activa: true,
  },
  {
    id: 'motores-bombas',
    nombre: 'Motores y Bombas',
    descripcion: 'Motores eléctricos, bombas hidráulicas, sistemas de flujo',
    icono: 'Zap',
    orden: 1,
    activa: true,
  },
  {
    id: 'cintas-transportadoras',
    nombre: 'Cintas Transportadoras',
    descripcion: 'Cintas de transporte, bandas, sistemas de movimiento',
    icono: 'MoveHorizontal',
    orden: 2,
    activa: true,
  },
  {
    id: 'refrigeracion',
    nombre: 'Sistemas de Refrigeración',
    descripcion: 'Chillers, torres de enfriamiento, intercambiadores de calor',
    icono: 'Snowflake',
    orden: 3,
    activa: true,
  },
  {
    id: 'tratamiento-agua',
    nombre: 'Tratamiento de Agua',
    descripcion: 'Filtros, purificadores, sistemas de tratamiento',
    icono: 'Droplet',
    orden: 4,
    activa: true,
  },
  {
    id: 'electricos',
    nombre: 'Sistemas Eléctricos',
    descripcion: 'Tableros, transformadores, sistemas de distribución eléctrica',
    icono: 'Cable',
    orden: 5,
    activa: true,
  },
  {
    id: 'herramientas-auxiliares',
    nombre: 'Herramientas y Accesorios',
    descripcion: 'Equipos auxiliares, herramientas de apoyo',
    icono: 'Wrench',
    orden: 6,
    activa: true,
  },
];

/**
 * Crear categorías en Firestore
 */
async function createCategories() {
  console.log('\n🏷️  CREANDO CATEGORÍAS DE MÁQUINAS\n');

  const batch = db.batch();
  let created = 0;
  let skipped = 0;

  for (const category of INITIAL_CATEGORIES) {
    const { id, ...data } = category;
    const docRef = db.collection('machineCategories').doc(id);

    // Verificar si ya existe
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
      console.log(`⏭️  Categoría "${category.nombre}" ya existe, omitiendo...`);
      skipped++;
      continue;
    }

    // Crear documento con timestamp
    batch.set(docRef, {
      ...data,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    created++;
    console.log(`✅ Preparando: ${category.nombre} (${category.icono})`);
  }

  if (created > 0) {
    await batch.commit();
    console.log(`\n✅ Se crearon ${created} categorías nuevas`);
  }

  if (skipped > 0) {
    console.log(`⏭️  Se omitieron ${skipped} categorías existentes`);
  }

  console.log('\n📊 CATEGORÍAS DISPONIBLES:');
  const snapshot = await db
    .collection('machineCategories')
    .orderBy('orden', 'asc')
    .get();

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`  ${data.orden}. ${data.nombre} (${data.icono})`);
  });

  console.log('\n✅ Script completado\n');
}

/**
 * Main
 */
async function main() {
  try {
    await createCategories();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
