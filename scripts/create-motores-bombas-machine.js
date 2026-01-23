/**
 * Script para crear una máquina virtual "Motores y Bombas"
 * que agrupe todos los motores y bombas de plantAssets
 * 
 * Ejecutar con: node scripts/create-motores-bombas-machine.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Crear máquina "Motores y Bombas"
 */
async function createMotoresBombasMachine() {
  console.log('\n🔧 CREANDO MÁQUINA: Motores y Bombas\n');

  const machineId = 'motores-bombas';
  const machineData = {
    id: machineId,
    nombre: 'Motores / Bombas',
    marca: 'Varios',
    modelo: 'Sistema',
    descripcion: 'Agrupación de todos los motores y bombas de la planta',
    categoryId: 'motores-bombas', // Usar la categoría existente
    activa: true,
    color: '#8b5cf6', // Púrpura
    orden: 10,
    manuals: [],
    infografias: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const docRef = db.collection('machines').doc(machineId);
    const existingDoc = await docRef.get();

    if (existingDoc.exists) {
      console.log('⚠️  La máquina "Motores / Bombas" ya existe');
      console.log('   ID:', machineId);
      return machineId;
    }

    await docRef.set(machineData);
    console.log('✅ Máquina creada exitosamente');
    console.log('   ID:', machineId);
    console.log('   Nombre:', machineData.nombre);
    console.log('   Categoría:', machineData.categoryId);

    return machineId;
  } catch (error) {
    console.error('❌ Error al crear la máquina:', error.message);
    throw error;
  }
}

/**
 * Contar plantAssets de tipo motor/bomba
 */
async function countMotoresYBombas() {
  console.log('\n📊 CONTANDO MOTORES Y BOMBAS...\n');

  try {
    const snapshot = await db.collection('plantAssets')
      .where('tipo', 'in', ['motor', 'bomba'])
      .get();

    const motores = snapshot.docs.filter(doc => doc.data().tipo === 'motor').length;
    const bombas = snapshot.docs.filter(doc => doc.data().tipo === 'bomba').length;

    console.log(`   Motores encontrados: ${motores}`);
    console.log(`   Bombas encontradas: ${bombas}`);
    console.log(`   Total: ${motores + bombas}`);

    return { motores, bombas, total: motores + bombas };
  } catch (error) {
    console.error('❌ Error al contar:', error.message);
    throw error;
  }
}

/**
 * Main
 */
async function main() {
  try {
    console.log('═'.repeat(60));
    console.log('  SETUP: Máquina Motores y Bombas');
    console.log('═'.repeat(60));

    // 1. Contar assets
    const { motores, bombas, total } = await countMotoresYBombas();

    if (total === 0) {
      console.log('\n⚠️  No se encontraron motores ni bombas en plantAssets');
      console.log('   Ejecuta primero el script de importación de datos');
      process.exit(0);
    }

    // 2. Crear máquina
    const machineId = await createMotoresBombasMachine();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ PROCESO COMPLETADO');
    console.log('═'.repeat(60));
    console.log(`\n📋 Resumen:`);
    console.log(`   • Máquina creada: ${machineId}`);
    console.log(`   • Assets disponibles: ${total} (${motores} motores, ${bombas} bombas)`);
    console.log(`   • Categoría: motores-bombas`);
    console.log(`\n💡 Próximos pasos:`);
    console.log(`   1. Abre la app y ve a "Repuestos"`);
    console.log(`   2. Selecciona la categoría "Motores y Bombas"`);
    console.log(`   3. Crea repuestos para estos equipos\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar
main();
