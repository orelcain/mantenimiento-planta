/**
 * Script para auto-asignar categorías a máquinas existentes
 * 
 * Analiza el nombre de cada máquina y asigna una categoría automáticamente
 * basándose en palabras clave.
 * 
 * Ejecutar con: node scripts/auto-assign-machine-categories.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Mapeo de palabras clave a categorías
 */
const CATEGORY_KEYWORDS = {
  'maquinas-principales': [
    'baader',
    'obm',
    'trimadora',
    'fileteadora',
    'grader',
    'clasificadora',
    'fishken',
    'cortadora',
    'guillotina',
    'desescamadora',
    'evisceradora',
  ],
  'motores-bombas': [
    'motor',
    'bomba',
    'hidroforo',
    'compresor',
    'ventilador',
    'turbina',
  ],
  'cintas-transportadoras': [
    'cinta',
    'banda',
    'transportador',
    'cadena',
    'elevador',
    'esquelones',
  ],
  'refrigeracion': [
    'chiller',
    'enfriamiento',
    'refrigeracion',
    'intercambiador',
    'evaporador',
    'condensador',
    'torre de enfriamiento',
  ],
  'tratamiento-agua': [
    'filtro',
    'purificador',
    'osmosis',
    'tratamiento agua',
    'desalinizador',
  ],
  'electricos': [
    'tablero',
    'transformador',
    'electrico',
    'generador',
    'ups',
    'banco',
  ],
  'herramientas-auxiliares': [
    'winche',
    'huinche',
    'grua',
    'polipasto',
    'montacarga',
  ],
};

/**
 * Determinar categoría basándose en el nombre de la máquina
 */
function detectCategory(machineName) {
  const nameLower = machineName.toLowerCase();

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return categoryId;
      }
    }
  }

  return null; // No se encontró categoría
}

/**
 * Auto-asignar categorías a máquinas
 */
async function autoAssignCategories() {
  console.log('\n🏷️  AUTO-ASIGNANDO CATEGORÍAS A MÁQUINAS\n');

  // Obtener todas las máquinas
  const machinesSnapshot = await db.collection('machines').get();

  if (machinesSnapshot.empty) {
    console.log('⚠️  No hay máquinas en la base de datos');
    return;
  }

  let assigned = 0;
  let skipped = 0;
  let notFound = 0;

  const batch = db.batch();

  for (const doc of machinesSnapshot.docs) {
    const machine = doc.data();
    const machineName = machine.nombre;

    // Si ya tiene categoría, omitir
    if (machine.categoryId) {
      console.log(`⏭️  "${machineName}" ya tiene categoría: ${machine.categoryId}`);
      skipped++;
      continue;
    }

    // Detectar categoría
    const detectedCategory = detectCategory(machineName);

    if (detectedCategory) {
      batch.update(doc.ref, {
        categoryId: detectedCategory,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      console.log(`✅ "${machineName}" → ${detectedCategory}`);
      assigned++;
    } else {
      console.log(`❓ "${machineName}" → Sin categoría detectada`);
      notFound++;
    }
  }

  if (assigned > 0) {
    await batch.commit();
    console.log(`\n✅ Se asignaron ${assigned} categorías`);
  }

  if (skipped > 0) {
    console.log(`⏭️  Se omitieron ${skipped} máquinas (ya tenían categoría)`);
  }

  if (notFound > 0) {
    console.log(`❓ ${notFound} máquinas sin categoría detectada (requieren asignación manual)`);
  }

  console.log('\n📊 RESUMEN POR CATEGORÍA:');
  const categoryCounts = {};

  const updatedSnapshot = await db.collection('machines').get();
  updatedSnapshot.forEach((doc) => {
    const machine = doc.data();
    const categoryId = machine.categoryId || 'sin-categoria';
    categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
  });

  // Obtener nombres de categorías
  const categoriesSnapshot = await db
    .collection('machineCategories')
    .orderBy('orden', 'asc')
    .get();

  const categoryNames = {};
  categoriesSnapshot.forEach((doc) => {
    categoryNames[doc.id] = doc.data().nombre;
  });

  for (const [categoryId, count] of Object.entries(categoryCounts)) {
    const categoryName = categoryNames[categoryId] || 'Sin categoría';
    console.log(`  ${categoryName}: ${count} máquina(s)`);
  }

  console.log('\n✅ Script completado\n');
}

/**
 * Main
 */
async function main() {
  try {
    await autoAssignCategories();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
