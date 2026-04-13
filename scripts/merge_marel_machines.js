/**
 * merge_marel_machines.js
 *
 * Fusiona marel-pendiente (Marel HG, 26 rep.) → marel-eviscerado (126 rep.)
 *
 * Acciones:
 *  1. Copia el único repuesto no-duplicado a marel-eviscerado
 *  2. Marca marel-pendiente como activa: false (soft-delete)
 *
 * Uso:
 *   --dry-run  (default) solo muestra qué haría
 *   --execute  ejecuta los cambios en Firestore
 */

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');

async function merge() {
  const SOURCE = 'marel-pendiente';
  const TARGET = 'marel-eviscerado';

  console.log(`\n${EXECUTE ? '🔥 MODO EJECUCIÓN' : '👀 MODO DRY-RUN'}\n`);

  // 1. Cargar repuestos de ambas máquinas
  const [srcSnap, tgtSnap] = await Promise.all([
    db.collection(`machines/${SOURCE}/repuestos`).get(),
    db.collection(`machines/${TARGET}/repuestos`).get(),
  ]);

  console.log(`Origen (${SOURCE}): ${srcSnap.size} repuestos`);
  console.log(`Destino (${TARGET}): ${tgtSnap.size} repuestos`);

  // 2. Indexar destino por codigoSAP
  const targetSAPs = new Set();
  for (const doc of tgtSnap.docs) {
    const sap = doc.data().codigoSAP;
    if (sap && sap !== 'pendiente') targetSAPs.add(sap);
  }

  // 3. Encontrar repuestos únicos del origen
  const toMove = [];
  for (const doc of srcSnap.docs) {
    const data = doc.data();
    const sap = data.codigoSAP;
    if (!sap || sap === 'pendiente' || !targetSAPs.has(sap)) {
      toMove.push({ id: doc.id, data });
    }
  }

  console.log(`\nRepuestos únicos a mover: ${toMove.length}`);
  for (const r of toMove) {
    console.log(`  • ${r.id} | SAP:${r.data.codigoSAP || '-'} | ${r.data.textoBreve || '-'}`);
  }

  if (!EXECUTE) {
    console.log(`\n📋 Dry-run completo. Usa --execute para aplicar cambios.`);
    return;
  }

  // 4. Copiar repuestos únicos al destino
  const batch = db.batch();

  for (const r of toMove) {
    const newRef = db.collection(`machines/${TARGET}/repuestos`).doc(r.id);
    batch.set(newRef, {
      ...r.data,
      movedFrom: SOURCE,
      movedAt: admin.firestore.Timestamp.now(),
    });
    console.log(`  ✅ Copiado: ${r.data.textoBreve}`);
  }

  // 5. Soft-delete máquina origen
  batch.update(db.collection('machines').doc(SOURCE), {
    activa: false,
    mergedInto: TARGET,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  console.log(`\n🗑️  ${SOURCE} marcada como inactiva (mergedInto: ${TARGET})`);

  await batch.commit();

  // 6. Verificar
  const verifySnap = await db.collection(`machines/${TARGET}/repuestos`).get();
  console.log(`\n✅ Fusión completada. ${TARGET} ahora tiene ${verifySnap.size} repuestos.`);
}

merge().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
