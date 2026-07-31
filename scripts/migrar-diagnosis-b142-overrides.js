/**
 * migrar-diagnosis-b142-overrides — reordena `learningContent/baader-142/diagnosis`
 * para que los 10 diagnósticos escritos desde el editor admin (ids `diag_<ts>_<rnd>`)
 * dejen de ser invisibles y no queden duplicados contra el seed.
 *
 * Contexto: hasta el fix de `listDiagnosis`, la 142 devolvía el seed PURO
 * (baader142Content.json, 34 filas crudas de la tabla de fallas del manual pág. 37)
 * y nunca leía Firestore. Los 10 docs escritos por la UI quedaron huérfanos.
 * Al activar el merge, 7 de ellos reescriben filas del seed → se les da el id de
 * la fila que reemplazan para que actúen como OVERRIDE en vez de sumarse.
 * Las filas que cada uno consolida se ocultan con soft-delete (`_deleted`).
 *
 * Decisión de Orel (2026-07-30): los códigos E77x/E8xx NO absorben las 16 filas
 * del manual — entran como entrada nueva y conviven, para que quien busque
 * "E823" siga encontrando su fila exacta.
 *
 * Snapshot previo: _snapshots/learningContent__baader-142__diagnosis__2026-07-30T22-37-54-098Z.json
 *
 *   node scripts/migrar-diagnosis-b142-overrides.js            ← DRY-RUN
 *   node scripts/migrar-diagnosis-b142-overrides.js --write    ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

const COL = db.collection('learningContent').doc('baader-142').collection('diagnosis');

/** doc de Firestore (id actual) → id del seed que pasa a sobrescribir */
const RENOMBRAR = {
  diag_1779398823269_i2v1zmw: 'b142-diag-herramientas-no-se-bajan',
  diag_1779399341863_3vgrfl8: 'b142-diag-corte-princesa-partido',
  diag_1779399706505_7lg3vx6: 'b142-diag-recto-queda-en-pescado',
  diag_1779399912734_rh4qsd5: 'b142-diag-cavidad-danada-ano-aleta',
  diag_1779400261893_wvgcys9: 'b142-diag-esofago-demasiado-largo',
  diag_1779400412109_azpeyt9: 'b142-diag-no-water-cooling-for-computer',
  diag_1779401365195_00ohohz: 'b142-diag-e777',
};

/** entran como entrada nueva: no hay fila equivalente en el seed (o se decidió
 *  que conviva). Se dejan tal cual, solo se listan para dejar constancia. */
const CONSERVAR = [
  'diag_1779397889985_rkro3h6', // Mal corte / apertura de vientre deficiente
  'diag_1779398332403_xxxdag2', // Aspiración débil (bomba de vacío SB 1100D0)
  'diag_1779400613052_g5ailew', // Códigos E77x/E8xx — convive con las 16 filas del manual
];

/** filas del seed absorbidas por un override: se ocultan con soft-delete */
const SOFT_DELETE = [
  // absorbidas por "Puntero/palpador no opera"
  'b142-diag-puntero-entra-con-anterioridad',
  'b142-diag-puntero-entra-con-retraso',
  'b142-diag-puntero-se-asienta-con-irregularidad',
  'b142-diag-puntero-se-asienta-lateralmente',
  // absorbidas por "Corte princesa partido o irregular"
  'b142-diag-corte-princesa-largo-corto',
  'b142-diag-corte-princesa-irregular',
  'b142-diag-corte-princesa-desgarrado',
  // absorbida por "Cortes/incisiones internas en la cavidad abdominal"
  'b142-diag-cavidad-danada-aleta-cabeza',
];

(async () => {
  console.log('=== MIGRAR diagnosis baader-142 ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===\n');
  let renombrados = 0, yaHechos = 0, marcados = 0;

  console.log('--- OVERRIDES (renombrar doc al id del seed que reemplaza)');
  for (const [viejo, nuevo] of Object.entries(RENOMBRAR)) {
    const srcSnap = await COL.doc(viejo).get();
    if (!srcSnap.exists) {
      const dstSnap = await COL.doc(nuevo).get();
      console.log(`  = ${nuevo}  ${dstSnap.exists ? '(ya migrado, se omite)' : '(ORIGEN NO EXISTE — revisar)'}`);
      if (dstSnap.exists) yaHechos++;
      continue;
    }
    const data = srcSnap.data();
    console.log(`  → ${viejo}\n      => ${nuevo}   "${data.title}"`);
    if (WRITE) {
      await COL.doc(nuevo).set({ ...data, id: nuevo, updatedAt: Date.now() });
      await COL.doc(viejo).delete();
    }
    renombrados++;
  }

  console.log('\n--- CONSERVAR como entrada nueva (sin cambios)');
  for (const id of CONSERVAR) {
    const snap = await COL.doc(id).get();
    console.log(`  · ${id}  ${snap.exists ? '"' + snap.data().title + '"' : '(NO EXISTE — revisar)'}`);
  }

  console.log('\n--- SOFT-DELETE (filas del seed absorbidas por un override)');
  for (const id of SOFT_DELETE) {
    console.log(`  x ${id}`);
    if (WRITE) {
      await COL.doc(id).set({ _deleted: true, updatedAt: Date.now() }, { merge: true });
    }
    marcados++;
  }

  console.log(`\nResumen: ${renombrados} renombrados, ${yaHechos} ya migrados, ${marcados} ocultos.`);
  console.log('Esperado en la ficha: 34 filas del seed - 8 ocultas = 26 (7 con contenido nuevo) + 3 entradas nuevas = 29.');
  if (!WRITE) console.log('\n(DRY-RUN: no se escribió nada. Repetir con --write para aplicar.)');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
