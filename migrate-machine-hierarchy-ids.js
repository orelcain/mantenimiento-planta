/**
 * migrate-machine-hierarchy-ids.js
 *
 * Corrige los hierarchyNodeId de las máquinas que tienen el ID en mayúsculas
 * (legado) a sus equivalentes reales en Firestore (mismo path, minúsculas).
 *
 * Uso:
 *   node migrate-machine-hierarchy-ids.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Mapa de IDs legados → IDs reales en Firestore (hierarchy collection)
const LEGACY_TO_REAL = {
  'AQ-IN-CHO-PCHO-PROC-EVIS': 'aq-in-cho-pcho-proc-evis',  // Eviscerado
  'AQ-IN-CHO-PCHO-PROC-FILE': 'aq-in-cho-pcho-proc-file',  // Filete
  'AQ-IN-CHO-PCHO-PROC-EMPA': 'aq-in-cho-pcho-proc-empa',  // Emparrillado
  'AQ-IN-CHO-PCHO-PROC-EMPQ': 'aq-in-cho-pcho-proc-empq',  // Empaque
  // AKCqKJGJWPQ5hN0Y3sNp (Bombas Agua Mar N2) → no está en el árbol activo;
  // se deja sin cambiar hasta confirmar el nodo correcto (720004480 o similar)
};

async function migrate() {
  console.log('🔍 Buscando máquinas con IDs legados...\n');

  const legacyIds = Object.keys(LEGACY_TO_REAL);
  let totalUpdated = 0;

  for (const legacyId of legacyIds) {
    const realId = LEGACY_TO_REAL[legacyId];

    // Verificar que el nodo real existe en Firestore
    const nodeSnap = await db.collection('hierarchy').doc(realId).get();
    if (!nodeSnap.exists) {
      console.log(`⚠️  Nodo real NO encontrado en Firestore: ${realId} — saltando ${legacyId}`);
      continue;
    }
    const nodeName = nodeSnap.data()?.nombre || realId;

    // Buscar máquinas que usan el ID legado
    const q = await db.collection('machines')
      .where('hierarchyNodeId', '==', legacyId)
      .get();

    if (q.empty) {
      console.log(`ℹ️  ${legacyId} → sin máquinas, nada que migrar`);
      continue;
    }

    const batch = db.batch();
    q.docs.forEach(doc => {
      batch.update(doc.ref, {
        hierarchyNodeId: realId,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      console.log(`  → ${doc.id} (${doc.data().nombre}) : ${legacyId} → ${realId} (${nodeName})`);
    });

    await batch.commit();
    console.log(`✅ ${q.size} máquinas migradas a "${nodeName}" (${realId})\n`);
    totalUpdated += q.size;
  }

  if (totalUpdated === 0) {
    console.log('\nℹ️  No se encontraron máquinas con IDs legados. Todo ya está migrado.');
  } else {
    console.log(`\n✅ Total: ${totalUpdated} máquinas actualizadas.`);
  }

  // Resumen de máquinas con AKCqKJGJWPQ5hN0Y3sNp (pendiente de decisión)
  const pendingSnap = await db.collection('machines')
    .where('hierarchyNodeId', '==', 'AKCqKJGJWPQ5hN0Y3sNp')
    .get();
  if (!pendingSnap.empty) {
    console.log('\n⏳ PENDIENTE: Las siguientes máquinas tienen hierarchyNodeId = AKCqKJGJWPQ5hN0Y3sNp');
    console.log('   Decidir si van a aq-in-cho-exte-estr (Estanque Transf. AM) o a otro nodo:');
    pendingSnap.docs.forEach(d => console.log(`   - ${d.id}: ${d.data().nombre}`));
  }
}

migrate().catch(console.error).finally(() => process.exit(0));
