#!/usr/bin/env node
/**
 * FASE 5 (rescate 2/2) — historial de stock + tags de solicitud
 *
 * a) historial: machines/{mid}/repuestos/{repId}/historial/* → repuestos/{flatId}/historial/*
 *    El flatId se resuelve con origen.repuestoIds que dejó la Fase 3 (04) en cada
 *    doc de la colección plana (`${mid}/${repId}` → docId plano). Idempotente:
 *    docId del historial = `${mid}__${repId}__${histId}`.
 *
 * b) tags de solicitud: machines/{mid}/settings/tags → un único doc consolidado
 *    `repuestosConfig/solicitudTags` (unión dedup por nombre+tipo). Eran globales
 *    duplicados por máquina.
 *
 * ADITIVO: no toca machines/* (se borra en el paso final de Fase 5).
 *
 * Uso:
 *   node scripts/normalizacion/08-migrate-historial-tags.js           ← DRY-RUN
 *   node scripts/normalizacion/08-migrate-historial-tags.js --write   ← aplica
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error('❌ Falta serviceAccountKey.json en la raíz.');
  process.exit(1);
}
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 5 — HISTORIAL + TAGS ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  // ── reverse map: `${mid}/${repId}` → flatDocId (desde origen.repuestoIds) ──
  const rSnap = await db.collection('repuestos').get();
  const revMap = new Map();
  for (const d of rSnap.docs) {
    const ids = d.data().origen?.repuestoIds || [];
    for (const ref of ids) revMap.set(ref, d.id);
  }
  console.log(`\nReverse map `.concat('`${mid}/${repId}`', ` → flatId: ${revMap.size} entradas (de ${rSnap.size} repuestos planos)`));

  // ── a) historial ──
  const histCG = await db.collectionGroup('historial').get();
  const machHist = histCG.docs.filter((d) => d.ref.path.startsWith('machines/'));
  // path: machines/{mid}/repuestos/{repId}/historial/{histId}
  const histOps = [];
  const huerfanos = [];
  for (const d of machHist) {
    const parts = d.ref.path.split('/');
    const mid = parts[1], repId = parts[3], histId = parts[5];
    const flatId = revMap.get(`${mid}/${repId}`);
    if (!flatId) { huerfanos.push(`${mid}/${repId}`); continue; }
    histOps.push({ flatId, docId: `${mid}__${repId}__${histId}`, data: d.data() });
  }
  console.log(`\nhistorial: ${machHist.length} docs en machines/* → ${histOps.length} mapeados | ${huerfanos.length} huérfanos`);
  if (huerfanos.length) console.log('  huérfanos (repuesto sin equivalente plano):\n    ' + [...new Set(huerfanos)].join('\n    '));
  if (histOps[0]) console.log('  ejemplo:', JSON.stringify(histOps[0].data).slice(0, 160));

  // ── b) tags de solicitud ──
  const settingsCG = await db.collectionGroup('settings').get();
  const tagDocs = settingsCG.docs.filter((d) => d.ref.path.startsWith('machines/') && d.id === 'tags');
  const tagSet = new Map(); // `${nombre}|${tipo}` → {nombre, tipo}
  for (const d of tagDocs) {
    for (const t of d.data().tags || []) {
      const key = `${t.nombre}|${t.tipo || ''}`;
      if (!tagSet.has(key)) tagSet.set(key, t);
    }
  }
  const tagsConsolidados = [...tagSet.values()];
  console.log(`\ntags: ${tagDocs.length} docs settings/tags → ${tagsConsolidados.length} tags únicos consolidados`);
  console.log('  ' + tagsConsolidados.map((t) => `${t.nombre} (${t.tipo || '?'})`).join(' · '));

  const report = {
    timestamp: new Date().toISOString(), modo: WRITE ? 'write' : 'dry-run',
    historial: { total: machHist.length, mapeados: histOps.length, huerfanos: [...new Set(huerfanos)] },
    tags: tagsConsolidados,
  };
  fs.writeFileSync(path.join(__dirname, '08-historial-tags-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReporte: ${path.relative(ROOT, path.join(__dirname, '08-historial-tags-report.json'))}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Revisar y correr con --write.\n');
    process.exit(0);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  // historial en lotes
  let w = 0;
  for (let i = 0; i < histOps.length; i += 400) {
    const batch = db.batch();
    for (const { flatId, docId, data } of histOps.slice(i, i + 400)) {
      batch.set(db.collection('repuestos').doc(flatId).collection('historial').doc(docId), data);
    }
    await batch.commit();
    w += Math.min(400, histOps.length - i);
  }
  // tags consolidados
  await db.collection('repuestosConfig').doc('solicitudTags').set({ tags: tagsConsolidados, migradoEn: now, updatedAt: now });

  console.log(`\n✓ Escritura completa: ${w} historial + 1 doc repuestosConfig/solicitudTags (${tagsConsolidados.length} tags).`);
  process.exit(0);
})().catch((e) => { console.error('❌ Error:', e.message); process.exit(1); });
