#!/usr/bin/env node
/**
 * FASE 5 — Backup pre-borrado (READ-ONLY, eficiente).
 *
 * Exporta a JSON TODO lo que se borrará en Fase 5. No escribe en Firestore.
 * Captura subcolecciones bajo docs "fantasma" (huérfanos) usando listDocuments.
 *
 *   - top-level: insumos, machines, plantAssets, repuestosBaader200
 *   - machines/<parent>/repuestos  (incl. parents fantasma: sin-asignar/multivac/SW2RNI*)
 *   - hierarchy/<parent>/repuestos (NO borra hierarchy)
 *
 * Salida: backups/fase5-<timestamp>/<coleccion>.json + _resumen.json
 *   node scripts/normalizacion/10-backup-fase5.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) { console.error('❌ Falta serviceAccountKey.json en la raíz.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const TOP_LEVEL = ['insumos', 'machines', 'plantAssets', 'repuestosBaader200'];
const PARENTS_WITH_SUB = ['machines', 'hierarchy']; // subcolección 'repuestos'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(ROOT, 'backups', `fase5-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });
const writeJson = (name, data) => fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));

// Dump de docs reales (query). Devuelve también los IDs de TODOS los refs (incl. fantasmas).
async function dumpTop(col) {
  const snap = await db.collection(col).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  writeJson(col, docs);
  const allRefIds = (await db.collection(col).listDocuments()).map(r => r.id); // incluye fantasmas
  return { docs: docs.length, allRefIds };
}

// Dump de <parent>/<sub> por cada parent (1 query por parent). Captura fantasmas.
async function dumpSub(parentCol, parentIds, sub) {
  const out = {}; let total = 0;
  for (const pid of parentIds) {
    const snap = await db.collection(parentCol).doc(pid).collection(sub).get();
    if (snap.empty) continue;
    out[pid] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    total += snap.size;
  }
  writeJson(`${parentCol}__${sub}`, out);
  return { parents: Object.keys(out).length, total };
}

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log('FASE 5 — BACKUP pre-borrado (read-only) →', path.relative(ROOT, OUT));
  console.log('='.repeat(64));
  const resumen = { timestamp: stamp, top: {}, sub: {} };
  const refIdsByCol = {};

  for (const col of TOP_LEVEL) {
    const r = await dumpTop(col);
    resumen.top[col] = { docsReales: r.docs, refsTotales: r.allRefIds.length };
    refIdsByCol[col] = r.allRefIds;
    console.log(`  ${col.padEnd(20)} docs=${r.docs} refs(incl. fantasmas)=${r.allRefIds.length}`);
  }

  for (const parent of PARENTS_WITH_SUB) {
    // para machines usamos TODOS los refs (incl. fantasmas); para hierarchy, los docs reales
    const ids = parent === 'machines'
      ? refIdsByCol['machines']
      : (await db.collection('hierarchy').listDocuments()).map(r => r.id);
    const r = await dumpSub(parent, ids, 'repuestos');
    resumen.sub[`${parent}/*/repuestos`] = r;
    console.log(`  ${(parent + '/*/repuestos').padEnd(20)} padres=${r.parents} docs=${r.total}`);
  }

  writeJson('_resumen', resumen);
  console.log('\n✓ Backup completo:', path.relative(ROOT, path.join(OUT, '_resumen.json')));
  console.log('  (Solo lectura — nada se escribió en Firestore.)\n');
  process.exit(0);
})().catch(e => { console.error('❌ Error:', e); process.exit(1); });
