const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function listRepuestos() {
  const machinesSnap = await db.collection('machines').get();
  console.log(`\n🔍 Máquinas encontradas: ${machinesSnap.size}`);

  for (const machineDoc of machinesSnap.docs) {
    const machineId = machineDoc.id;
    const machineData = machineDoc.data();
    const repuestosCol = machineDoc.ref.collection('repuestos');
    const repuestosSnap = await repuestosCol.get();

    console.log(`\n👉 ${machineId} (${machineData.nombre || 'sin nombre'})`);
    console.log(`   Repuestos: ${repuestosSnap.size}`);

    if (repuestosSnap.empty) continue;

    for (const repDoc of repuestosSnap.docs) {
      const rep = repDoc.data();
      console.log(`   • ${repDoc.id} | SAP: ${rep.codigoSAP || 'N/A'} | ${rep.textoBreve || 'sin texto'} | stock: ${rep.cantidad ?? 'N/A'}`);
    }
  }
}

listRepuestos().then(() => process.exit(0)).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
