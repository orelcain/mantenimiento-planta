const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function check() {
  // 1. Buscar todos los nodos de jerarquía con linkedMachineId
  const snap = await db.collection('hierarchy')
    .where('linkedMachineId', '!=', null)
    .get();

  console.log(`Nodos con linkedMachineId: ${snap.size}\n`);

  // Agrupar por machineId
  const byMachine = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    const mid = d.linkedMachineId;
    if (!byMachine[mid]) byMachine[mid] = [];
    byMachine[mid].push({ id: doc.id, nombre: d.nombre, codigo: d.codigo });
  }

  for (const [machineId, nodes] of Object.entries(byMachine)) {
    // Obtener datos de la máquina
    const machineDoc = await db.collection('machines').doc(machineId).get();
    const machineData = machineDoc.exists ? machineDoc.data() : null;
    const repSnap = machineDoc.exists ? await machineDoc.ref.collection('repuestos').get() : { size: 0 };

    console.log(`📦 ${machineId} (${machineData?.nombre || 'NO EXISTE'}) — ${repSnap.size} rep. — activa: ${machineData?.activa ?? '?'}`);
    console.log(`   Vinculado a ${nodes.length} nodo(s):`);
    for (const n of nodes) {
      console.log(`     • ${n.id} | ${n.nombre} | ${n.codigo}`);
    }
    console.log('');
  }
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
