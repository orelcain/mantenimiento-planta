/**
 * Script para asegurar que la categoría raíz "Motores y Bombas" está visible
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function showMotoresBombasCategory() {
  try {
    console.log('🔄 Buscando categoría Motores y Bombas...');
    
    // Buscar la categoría raíz
    const q = db.collection('machineCategories').where('id', '==', 'motores-bombas');
    const snapshot = await q.get();
    
    if (snapshot.empty) {
      console.log('❌ No existe la categoría "motores-bombas"');
      console.log('✨ Creando categoría raíz...');
      
      const newCategory = {
        id: 'motores-bombas',
        nombre: 'Motores y Bombas',
        descripcion: 'Motores, bombas y equipos asociados',
        icono: 'Zap',
        orden: 1,
        activa: true,
        visible: true,
        parentId: null,
        nivel: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await db.collection('machineCategories').doc('motores-bombas').set(newCategory);
      console.log('✅ Categoría creada: Motores y Bombas');
    } else {
      console.log('✅ Categoría encontrada');
      
      // Marcar como visible
      const docId = snapshot.docs[0].id;
      await db.collection('machineCategories').doc(docId).update({
        visible: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('✅ Categoría marcada como visible');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

showMotoresBombasCategory();
