#!/usr/bin/env node
/**
 * FASE 5 (rescate 1/2) — manuales de `machines` → colección plana `manuales`
 *
 * Las 5 máquinas con PDFs (baader-142, baader-200, grader, knuro,
 * marel-eviscerado) tienen un array `manuals`. Se migran a la colección
 * top-level `manuales` con el mismo modelo N:M que `repuestos`:
 *   - docId determinístico = <machineId>__<idx> (idempotente).
 *   - equipos = destinoNodos del reconciliation-map de esa máquina (resueltos a
 *     docIds de hierarchy), para que el manual aparezca en TODAS las instancias
 *     del modelo (ej. "Baader 142" → las 6 evisceradoras).
 *   - Conserva url/título/metadata original; el título se deriva del nombre de
 *     archivo si el manual es solo una URL.
 *
 * ADITIVO: no toca machines/* (se borra en el paso final de Fase 5).
 *
 * Uso:
 *   node scripts/normalizacion/07-migrate-manuales.js           ← DRY-RUN
 *   node scripts/normalizacion/07-migrate-manuales.js --write   ← aplica
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

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'reconciliation-map.json'), 'utf8'));
const MACHINE_IDS = {
  'Baader 142': 'baader-142', 'Baader 200': 'baader-200', 'Grader': 'grader',
  'Knuro': 'knuro', 'Marel Eviscerado': 'marel-eviscerado',
};
const MACHINES_CON_MANUALES = Object.values(MACHINE_IDS);

// título legible desde una URL de Storage (…/manuales/<archivo>_<ts>.pdf)
const titleFromUrl = (url) => {
  try {
    const m = decodeURIComponent(url).match(/manuales\/(.+?)(?:_\d{10,})?\.pdf/i);
    return m ? m[1].replace(/[-_]+/g, ' ').trim() : 'Manual';
  } catch { return 'Manual'; }
};

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 5 — MANUALES → colección plana ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  // hierarchy: código → doc, nombre(s/c) → doc
  const hSnap = await db.collection('hierarchy').get();
  const byCodigo = new Map(), byNombre = new Map(), byId = new Map();
  for (const d of hSnap.docs) {
    const data = d.data(); byId.set(d.id, { id: d.id, ...data });
    const c = (data.codigo || '').trim();
    if (c) byCodigo.set(c, { id: d.id, ...data });
    else byNombre.set((data.nombre || '').trim().toUpperCase(), { id: d.id, ...data });
  }
  const resolveDest = (dest) => {
    const m = dest.match(/^<(.+)>$/);
    if (m) return byNombre.get(m[1].trim().toUpperCase()) || null;
    return byCodigo.get(dest) || null;
  };
  const nodosDeMachine = (mid) => {
    const entry = MAP.mapa.find((e) => MACHINE_IDS[e.machine] === mid);
    if (!entry) return [];
    return entry.destinoNodos.map(resolveDest).filter(Boolean);
  };

  const docs = [];
  for (const mid of MACHINES_CON_MANUALES) {
    const snap = await db.collection('machines').doc(mid).get();
    const m = snap.data() || {};
    const manuals = m.manuals || [];
    const nodos = nodosDeMachine(mid);
    if (!nodos.length) { console.log(`⚠ ${mid}: sin nodos destino en reconciliation-map`); }
    console.log(`\n${mid} (${m.nombre}): ${manuals.length} manual(es) → ${nodos.length} equipo(s) [${nodos.map((n) => n.codigo || 's/c').join(', ')}]`);
    manuals.forEach((man, idx) => {
      const isStr = typeof man === 'string';
      const url = isStr ? man : (man.url || man.href || '');
      const titulo = isStr ? titleFromUrl(url) : (man.nombre || man.titulo || man.title || titleFromUrl(url));
      console.log(`  [${idx}] "${titulo}"  ${isStr ? '(string)' : '(obj: ' + Object.keys(man).join(',') + ')'}`);
      docs.push({
        docId: `${mid}__${idx}`,
        data: {
          titulo,
          url,
          tipo: 'manual',
          machineOrigen: mid,
          equipos: nodos.map((n) => n.id),
          equiposCodigos: nodos.map((n) => (n.codigo || '').trim() || `s/c:${n.nombre}`),
          ...(isStr ? {} : man), // conserva metadata original si era objeto
        },
      });
    });
  }

  console.log(`\nTotal manuales a crear: ${docs.length}`);
  const report = { timestamp: new Date().toISOString(), modo: WRITE ? 'write' : 'dry-run', docs };
  fs.writeFileSync(path.join(__dirname, '07-manuales-report.json'), JSON.stringify(report, null, 2));
  console.log(`Reporte: ${path.relative(ROOT, path.join(__dirname, '07-manuales-report.json'))}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Revisar y correr con --write.\n');
    process.exit(0);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const { docId, data } of docs) {
    batch.set(db.collection('manuales').doc(docId), { ...data, migradoEn: now, createdAt: now, updatedAt: now });
  }
  await batch.commit();

  const verify = await db.collection('manuales').get();
  const bad = verify.docs.filter((d) => !(d.data().equipos || []).length || !d.data().url);
  console.log(`\n✓ Escritura completa: ${docs.length} docs. Colección `.concat('`manuales`', `: ${verify.size}.`));
  console.log(bad.length === 0 ? '✓ Verificación: todos con url + equipos.' : `⚠ ${bad.length} docs incompletos: ${bad.map((d) => d.id).join(', ')}`);
  process.exit(bad.length === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ Error:', e.message); process.exit(1); });
