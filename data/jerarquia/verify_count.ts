const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function verify() {
  const activos = await db.collection('hierarchy').where('activo', '==', true).get();
  const todos = await db.collection('hierarchy').get();
  
  console.log('=== VERIFICACIÓN FIRESTORE ===');
  console.log('Total documentos:', todos.size);
  console.log('Nodos activos (activo=true):', activos.size);
  console.log('Nodos inactivos:', todos.size - activos.size);
  
  const sample = activos.docs[0]?.data();
  if (sample) {
    console.log('\nEjemplo de campos en un nodo:');
    console.log('- nombre:', sample.nombre ? '✓' : '✗');
    console.log('- codigo:', sample.codigo ? '✓' : '✗');
    console.log('- activo:', sample.activo);
    console.log('- nivel:', sample.nivel);
    console.log('- parentId:', sample.parentId || 'null');
  }
  
  process.exit(0);
}

verify();
