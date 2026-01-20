const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const TARGETS = ['pendiente', 'totales'];
const MACHINE_ID = 'baader-200';

async function main() {
  const col = admin.firestore().collection(`machines/${MACHINE_ID}/repuestos`);
  for (const id of TARGETS) {
    const ref = col.doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`✅ Borrado ${id}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
