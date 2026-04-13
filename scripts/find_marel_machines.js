const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function find() {
  const snap = await db.collection('machines').get();
  console.log(`Total máquinas: ${snap.size}\n`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const nombre = (d.nombre || '').toLowerCase();
    if (nombre.includes('marel') || nombre.includes('hg')) {
      const repSnap = await doc.ref.collection('repuestos').get();
      console.log(`ID: ${doc.id}`);
      console.log(`  nombre: ${d.nombre}`);
      console.log(`  marca: ${d.marca || '-'}`);
      console.log(`  modelo: ${d.modelo || '-'}`);
      console.log(`  activa: ${d.activa}`);
      console.log(`  hierarchyNodeId: ${d.hierarchyNodeId || '-'}`);
      console.log(`  repuestos: ${repSnap.size}`);
      console.log('');
    }
  }
}
find().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
