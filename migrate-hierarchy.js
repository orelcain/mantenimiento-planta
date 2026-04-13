const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const MIGRATION_MAP = {
  'baader-142':       'AQ-IN-CHO-PCHO-PROC-EVIS',
  'baader-200':       'AQ-IN-CHO-PCHO-PROC-FILE',
  'gea-v2':           'AQ-IN-CHO-PCHO-PROC-FILE',
  'marel-filete':     'AQ-IN-CHO-PCHO-PROC-FILE',
  'marel-eviscerado': 'AQ-IN-CHO-PCHO-PROC-EVIS',
  'knuro':            'AQ-IN-CHO-PCHO-PROC-EVIS',
  'grader':           'AQ-IN-CHO-PCHO-PROC-EMPA',
  'videojet':         'AQ-IN-CHO-PCHO-PROC-FILE',
  'garibaldi':        'AQ-IN-CHO-PCHO-PROC-EMPQ',
  'detector-metales': 'AQ-IN-CHO-PCHO-PROC-EMPQ',
  'fishken':          'AQ-IN-CHO-PCHO-PROC-EMPQ',
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
    if (data.hierarchyNodeId) {
      console.log(`✓  Ya tiene área: ${machineId} → ${data.hierarchyNodeId}`);
      continue;
    }
    batch.update(ref, { hierarchyNodeId: nodeId, updatedAt: admin.firestore.Timestamp.now() });
    console.log(`→  ${machineId} → ${nodeId}`);
    count++;
  }

  if (count === 0) {
    console.log('\nTodas las máquinas ya tenían área asignada.');
    return;
  }

  await batch.commit();
  console.log(`\n✅ Migración completada: ${count} máquinas actualizadas.`);
}

migrate().catch(console.error).finally(() => process.exit(0));
