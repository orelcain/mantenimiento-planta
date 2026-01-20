const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function main() {
  try {
    console.log('🔍 Buscando colecciones de repuestos...\n');
    
    // Listar todas las colecciones
    const collections = await db.listCollections();
    const repuestoCollections = collections.filter(c => c.id.includes('repuesto') || c.id.includes('Repuesto'));
    
    console.log('Colecciones con "repuesto":');
    for (const col of repuestoCollections) {
      const snapshot = await col.limit(3).get();
      console.log(`  - ${col.id}: ${snapshot.size} documentos`);
    }
    
    // Listar subcollections de machines
    console.log('\nSubcollections en machines:');
    const machinesSnap = await db.collection('machines').get();
    for (const machineDoc of machinesSnap.docs) {
      const subs = await machineDoc.ref.listCollections();
      const repSubs = subs.filter(s => s.id.includes('repuesto'));
      if (repSubs.length > 0) {
        const repSnap = await machineDoc.ref.collection(repSubs[0].id).limit(1).get();
        console.log(`  machines/${machineDoc.id}/${repSubs[0].id}: ${repSnap.size} documentos`);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
