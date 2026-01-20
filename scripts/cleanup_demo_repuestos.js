#!/usr/bin/env node
/**
 * Elimina repuestos de demo (TEST-*, rep-*) y SAP ficticios (4500000000+).
 *
 * Uso:
 *   node scripts/cleanup_demo_repuestos.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function isDemoRepuesto(docId, data) {
  const sap = (data.codigoSAP || '').toString().toUpperCase();
  const id = docId.toString().toUpperCase();

  // IDs o SAP marcados como TEST
  if (id.startsWith('TEST') || sap.startsWith('TEST')) return true;

  // IDs autogenerados de demo (rep-0001 ...)
  if (id.startsWith('REP-')) return true;

  // SAP ficticios muy largos (ej: 4500000000+ de los seeds demo)
  if (sap.startsWith('4500000') && sap.length >= 9) return true;

  return false;
}

async function cleanup() {
  const machinesSnap = await db.collection('machines').get();
  console.log(`\n🔍 Máquinas: ${machinesSnap.size}`);

  let totalDeleted = 0;
  let totalKept = 0;

  for (const machineDoc of machinesSnap.docs) {
    const machineId = machineDoc.id;
    const repSnap = await machineDoc.ref.collection('repuestos').get();
    if (repSnap.empty) continue;

    let deleted = 0;
    let kept = 0;

    for (const repDoc of repSnap.docs) {
      const data = repDoc.data();
      if (isDemoRepuesto(repDoc.id, data)) {
        await repDoc.ref.delete();
        deleted++;
      } else {
        kept++;
      }
    }

    if (deleted > 0) {
      console.log(`👉 ${machineId}: borrados ${deleted}, quedan ${kept}`);
    }

    totalDeleted += deleted;
    totalKept += kept;
  }

  console.log(`\n✅ Eliminados demo: ${totalDeleted}`);
  console.log(`ℹ️  Repuestos válidos que permanecen: ${totalKept}`);
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
