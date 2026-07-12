/**
 * seed-comun-baader142 — migra la lista curada de "repuestos comunes" del Baader 142
 * (los 27 de la planilla, que vivían hard-coded en commonPartsByMachine.ts) al campo
 * compartido `comunEn` del doc `repuestos`, para que TODO sea editable desde la UI.
 *
 * Idempotente (arrayUnion no duplica). Busca el doc por docId=SAP y, si no, por el
 * campo codigoSAP. Reporta encontrados / no encontrados.
 *
 *   node scripts/seed-comun-baader142.js            ← DRY-RUN
 *   node scripts/seed-comun-baader142.js --write     ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const SLUG = 'baader-142';

// SAPs de la planilla "repuestos baader 142 mas comunes" (27 únicos).
const SAPS = [
  '3300126381', '3300111948', '3300012407', '3300012430', '3300011875', '3300106055',
  '3300048553', '3300084243', '3300035260', '3300012306', '3300106148', '3300011872',
  '3300011880', '3300012256', '3300012257', '3300105943', '3300035316', '3300115674',
  '3300074792', '3300035285', '3300058572', '3300027307', '3300098470', '3300012350',
  '3300128967', '3300103402', '3300083785',
];

(async () => {
  console.log('=== SEED comunEn baader-142 ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===');
  const col = db.collection('repuestos');
  let found = 0, missing = [], already = 0;
  for (const sap of SAPS) {
    // doc por id, o por campo codigoSAP
    let ref = col.doc(sap);
    let snap = await ref.get();
    if (!snap.exists) {
      const q = await col.where('codigoSAP', '==', sap).limit(1).get();
      if (q.empty) { missing.push(sap); continue; }
      snap = q.docs[0]; ref = snap.ref;
    }
    found++;
    const cur = snap.data().comunEn || [];
    const yaEsta = cur.includes(SLUG);
    if (yaEsta) already++;
    const nombre = snap.data().textoBreve || snap.data().descripcion || '(sin nombre)';
    console.log(` ${yaEsta ? '·' : '+'} ${sap}  ${String(snap.data().tipo || '?').padEnd(12)} ${nombre.slice(0, 45)}`);
    if (WRITE && !yaEsta) {
      await ref.update({ comunEn: admin.firestore.FieldValue.arrayUnion(SLUG) });
    }
  }
  console.log(`\nEncontrados: ${found}/${SAPS.length} | ya marcados: ${already} | por marcar: ${found - already}`);
  if (missing.length) console.log('NO encontrados en el maestro:', missing.join(', '));
  if (!WRITE) console.log('\n(DRY-RUN — nada escrito. Corré con --write para aplicar.)');
  else console.log('\n✓ Aplicado.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
