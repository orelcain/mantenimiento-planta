const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Bombas caseta agua mar → BOMBAS AGUA MAR N2
// Bomba estanque inox   → ESTANQUE DE TRANSFERENCIA AM
// Nota: wcRCMGfHkUwZYu5LI4P4, 1vkDGEogFRujzwTGbhkd, M4qu273w3kj6eBvamorq
//       tienen hierarchyNodeId numérico erróneo → se sobrescriben igual
const MIGRATION_MAP = {
  'nOWm9HEj8YCzLAGTD31T': 'AKCqKJGJWPQ5hN0Y3sNp', // Motor bomba caseta agua mar   → BOMBAS AGUA MAR N2
  'w0bdEDY82jZoqiA6R3MN': 'AKCqKJGJWPQ5hN0Y3sNp', // Bomba caseta agua mar 40/26   → BOMBAS AGUA MAR N2
  'wcRCMGfHkUwZYu5LI4P4': 'AKCqKJGJWPQ5hN0Y3sNp', // Bomba caseta mar 40/26 (fix)  → BOMBAS AGUA MAR N2
  '1vkDGEogFRujzwTGbhkd': 'AKCqKJGJWPQ5hN0Y3sNp', // Bomba 40/26 caseta mar (fix)  → BOMBAS AGUA MAR N2
  'M4qu273w3kj6eBvamorq': 'aq-in-cho-exte-estr',   // Bomba Estanque inox 40/26     → ESTANQUE TRANSFERENCIA AM
};

async function migrate() {
  const batch = db.batch();
  let count = 0;

  for (const [machineId, nodeId] of Object.entries(MIGRATION_MAP)) {
    const ref = db.collection('machines').doc(machineId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`⚠️  No existe: ${machineId}`);
      continue;
    }
    const data = snap.data();
    const current = data.hierarchyNodeId;

    // Siempre actualizar (para corregir IDs numéricos erróneos)
    batch.update(ref, { hierarchyNodeId: nodeId, updatedAt: admin.firestore.Timestamp.now() });
    if (current && current !== nodeId) {
      console.log(`→  ${machineId} (${data.nombre || ''})  ${current} → ${nodeId}  [CORRECCIÓN]`);
    } else if (current === nodeId) {
      console.log(`✓  ${machineId} ya tiene área correcta: ${nodeId}`);
    } else {
      console.log(`→  ${machineId} (${data.nombre || ''}) → ${nodeId}`);
    }
    count++;
  }

  if (count === 0) {
    console.log('\nNada que migrar.');
    return;
  }

  await batch.commit();
  console.log(`\n✅ Migración completada: ${count} máquinas actualizadas.`);
}

migrate().catch(console.error).finally(() => process.exit(0));
