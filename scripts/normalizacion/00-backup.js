#!/usr/bin/env node
/**
 * FASE 0 — Backup completo (READ-ONLY)
 *
 * Exporta a JSON las colecciones afectadas por la normalización del modelo de
 * datos, ANTES de cualquier migración. No escribe nada en Firestore.
 *
 * Salida: backups/normalizacion-<timestamp>/<coleccion>.json + _resumen.json
 *
 * Uso:
 *   node scripts/normalizacion/00-backup.js
 * Requiere serviceAccountKey.json en la raíz (o GOOGLE_APPLICATION_CREDENTIALS).
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Conexión (mismo patrón que el resto de scripts del proyecto) ──
const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error('❌ Falta serviceAccountKey.json en la raíz (o GOOGLE_APPLICATION_CREDENTIALS).');
  console.error('   Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.');
  process.exit(1);
}
const db = admin.firestore();

// ── Colecciones top-level a respaldar ──
const TOP_LEVEL = ['hierarchy', 'machines', 'plantAssets', 'bodega', 'insumos'];
// ── Subcolección "repuestos" a respaldar bajo estos padres ──
const PARENTS_WITH_REPUESTOS = ['machines', 'hierarchy'];

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(ROOT, 'backups', `normalizacion-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });

const writeJson = (name, data) =>
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));

async function dumpCollection(col) {
  const snap = await db.collection(col).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  writeJson(col, docs);
  return docs;
}

async function dumpSubcollection(parentCol, parentIds, sub) {
  const out = {}; // { parentId: [docs] }
  let total = 0;
  for (const pid of parentIds) {
    const snap = await db.collection(parentCol).doc(pid).collection(sub).get();
    if (snap.empty) continue;
    out[pid] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    total += snap.size;
  }
  writeJson(`${parentCol}__${sub}`, out);
  return total;
}

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log('FASE 0 — BACKUP (read-only) →', path.relative(ROOT, OUT));
  console.log('='.repeat(64));
  const resumen = { timestamp: stamp, colecciones: {}, subcolecciones: {} };

  const topDocs = {};
  for (const col of TOP_LEVEL) {
    const docs = await dumpCollection(col);
    topDocs[col] = docs;
    resumen.colecciones[col] = docs.length;
    console.log(`  ${col.padEnd(14)} ${docs.length} docs`);
  }

  for (const parent of PARENTS_WITH_REPUESTOS) {
    const ids = (topDocs[parent] || []).map((d) => d.id);
    const total = await dumpSubcollection(parent, ids, 'repuestos');
    resumen.subcolecciones[`${parent}/*/repuestos`] = total;
    console.log(`  ${(parent + '/*/repuestos').padEnd(20)} ${total} docs`);
  }

  writeJson('_resumen', resumen);
  console.log('\n✓ Backup completo. Resumen:', path.relative(ROOT, path.join(OUT, '_resumen.json')));
  console.log('  (Ninguna escritura en Firestore — solo lectura.)\n');
  process.exit(0);
})().catch((e) => {
  console.error('❌ Error en backup:', e.message);
  process.exit(1);
});
