/**
 * add-5-materiales — alta de los 5 SAP del Excel que faltaban en el maestro.
 *
 * Crea cada uno en `repuestos` (docId=SAP, transversal, clase=repuesto) + su
 * entrada en `bodega` (stock/ubicación del Excel "inventario 2026").
 * Idempotente: si el doc ya existe, NO lo pisa (solo crea los que faltan).
 *
 *   node scripts/add-5-materiales.js           ← DRY-RUN
 *   node scripts/add-5-materiales.js --write    ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const TS = admin.firestore.FieldValue.serverTimestamp();

// Data confirmada del Excel STOCK ALMACENES (hoja "inventario 2026" = stock/ubic; ALMACEN = valorUnitario)
const MATERIALES = [
  { sap: '3300033144', texto: 'AUTOMATICO 2P 6A',                          stock: 3,  ubic: '',    valor: 21.18 },
  { sap: '3300139135', texto: 'FOCO LED ALUMBRADO PUBLICO SOLAR 100W',     stock: 0,  ubic: '',    valor: 0 },
  { sap: '3300104815', texto: 'CUCHILLO ESVISCERADOR GANCHO FROSTS 351P',  stock: 0,  ubic: '',    valor: 25.31 },
  { sap: '3300139470', texto: 'PATA REGULADORA D65 M16X300MM',             stock: 30, ubic: '',    valor: 31.77 },
  { sap: '3300101498', texto: 'EMPAQUETADURA DE SILICONA 513X713MM 3X1',   stock: 10, ubic: 'C-6', valor: 0 },
];

(async () => {
  console.log('=== ALTA 5 MATERIALES ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===');
  const repCol = db.collection('repuestos');
  const bodCol = db.collection('bodega');
  let crearRep = 0, crearBod = 0, saltar = 0;
  const ops = [];

  for (const m of MATERIALES) {
    const repRef = repCol.doc(m.sap);
    const bodRef = bodCol.doc(m.sap);
    const [repSnap, bodSnap] = await Promise.all([repRef.get(), bodRef.get()]);

    if (repSnap.exists) { console.log(`  ${m.sap}  ya existe en maestro → SALTAR`); saltar++; }
    else {
      crearRep++;
      console.log(`  ${m.sap}  ${m.texto}  [maestro+bodega: stock ${m.stock}${m.ubic ? ', ubic ' + m.ubic : ''}]`);
      ops.push({ ref: repRef, data: {
        codigoSAP: m.sap, tieneSap: true, clase: 'repuesto',
        textoBreve: m.texto, descripcion: m.texto, codigoFabricante: '',
        tipo: 'OTROS', seccion: 'Inventario 2026',
        equipos: [], equiposCodigos: [], parentRepuestoId: null,
        valorUnitario: m.valor, cantidadPorMaquina: 1,
        fotosReales: [], vinculosManual: [], imagenesManual: [], numeroSerie: '', nombreManual: '',
        origen: { de: ['excel-faltantes-2026-06-20'], ids: [m.sap] },
        createdAt: TS, updatedAt: TS,
      }});
    }
    if (!bodSnap.exists) {
      crearBod++;
      ops.push({ ref: bodRef, data: {
        codigoSAP: m.sap, stockActual: m.stock, stockMinimo: 0,
        ubicacionBodega: m.ubic, unidad: 'pzas', createdAt: TS, updatedAt: TS,
      }});
    }
  }

  console.log(`\nResumen: crear ${crearRep} en maestro, ${crearBod} en bodega; saltar ${saltar}.`);
  if (!WRITE) { console.log('DRY-RUN: nada escrito. Corré con --write para aplicar.'); process.exit(0); }

  const batch = db.batch();
  for (const op of ops) batch.set(op.ref, op.data, { merge: false });
  await batch.commit();
  console.log('LISTO: escritos ' + ops.length + ' docs.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
