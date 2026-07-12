/**
 * crear-2-comunes-baader142 — crea en el maestro `repuestos` los 2 comunes del
 * Baader 142 que NO existían (correa 835 5M, punto de engrase), con su nombre
 * común y ya marcados como comunes (comunEn=['baader-142']). Crea también su
 * entrada en `bodega` (stock 0). Idempotente: si el doc ya existe, NO lo pisa.
 *
 *   node scripts/crear-2-comunes-baader142.js            ← DRY-RUN
 *   node scripts/crear-2-comunes-baader142.js --write     ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const TS = admin.firestore.FieldValue.serverTimestamp();

const NUEVOS = [
  { sap: '3300035260', textoBreve: 'CORREA 835 5M', nombreComun: 'Correa 835 5M', tipo: 'CORREA', fab: '' },
  { sap: '3300027307', textoBreve: 'PUNTO DE ENGRASE ANCHO', nombreComun: 'Punto de engrase (ancho)', tipo: 'OTROS', fab: '1424101003' },
];

(async () => {
  console.log('=== CREAR 2 comunes Baader 142 ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===');
  const repCol = db.collection('repuestos');
  const bodCol = db.collection('bodega');
  const ops = [];
  for (const m of NUEVOS) {
    const repRef = repCol.doc(m.sap);
    const bodRef = bodCol.doc(m.sap);
    const [repSnap, bodSnap] = await Promise.all([repRef.get(), bodRef.get()]);
    if (repSnap.exists) {
      // por si aparece: solo asegurar la marca comunEn
      console.log(`  ${m.sap}  ya existe → asegurar comunEn`);
      if (WRITE) await repRef.update({ comunEn: admin.firestore.FieldValue.arrayUnion('baader-142') });
    } else {
      console.log(`  + ${m.sap}  ${m.nombreComun}  [${m.tipo}]  crear maestro+bodega`);
      ops.push({ ref: repRef, data: {
        codigoSAP: m.sap, tieneSap: true, clase: 'repuesto',
        textoBreve: m.textoBreve, descripcion: m.nombreComun, codigoFabricante: m.fab,
        nombresComunes: [m.nombreComun],
        tipo: m.tipo, seccion: 'Baader 142 - comunes',
        equipos: [], equiposCodigos: [], parentRepuestoId: null,
        comunEn: ['baader-142'],
        valorUnitario: 0, cantidadPorMaquina: 1,
        fotosReales: [], vinculosManual: [], imagenesManual: [], numeroSerie: '', nombreManual: '',
        origen: { de: ['planilla-baader142-comunes'], ids: [m.sap] },
        createdAt: TS, updatedAt: TS,
      }});
    }
    if (!bodSnap.exists) {
      ops.push({ ref: bodRef, data: {
        codigoSAP: m.sap, stockActual: 0, stockMinimo: 0, ubicacionBodega: '', unidad: 'pzas', createdAt: TS, updatedAt: TS,
      }});
    }
  }
  console.log(`\nOps a escribir: ${ops.length}`);
  if (!WRITE) { console.log('DRY-RUN: nada escrito.'); process.exit(0); }
  const batch = db.batch();
  for (const op of ops) batch.set(op.ref, op.data, { merge: false });
  await batch.commit();
  console.log('✓ LISTO: escritos ' + ops.length + ' docs.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
