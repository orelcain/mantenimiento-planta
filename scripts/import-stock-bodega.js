/**
 * import-stock-bodega — IMPORTACIÓN ÚNICA (seed) de stock+ubicación a `bodega`.
 *
 * Fuente: STOCK ALMACENES.xlsx (centro AI04 / Chonchi, actualizado a mano).
 *  - "inventario 2026": material(SAP) | cantidad | ubicacion | equipo  → stock + ubic
 *  - "Clasificacion":  Material(SAP) | Ubicación                       → ubic (fallback)
 * Solo escribe SAP que YA existen en el maestro `repuestos`. Idempotente.
 * Preserva stockMinimo/unidad de docs de bodega ya configurados.
 *
 *   node scripts/import-stock-bodega.js           ← DRY-RUN (no escribe)
 *   node scripts/import-stock-bodega.js --write    ← aplica
 */
const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const isSap = s => /^\d{6,}$/.test(String(s || '').trim());
const FILE = 'C:/Users/orelc/OneDrive/ANTARFOOD/INVENTARIO/STOCK ALMACENES.xlsx';

function rowsOf(wb, sheet) { return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' }); }

(async () => {
  const wb = XLSX.readFile(FILE);
  // ── inventario 2026: stock + ubic ──
  const inv = rowsOf(wb, 'inventario 2026');
  const ih = inv.findIndex(r => r.some(c => /material/i.test(String(c))));
  const IH = inv[ih].map(c => String(c).toUpperCase());
  const im = IH.findIndex(h => /MATERIAL/.test(h)), iq = IH.findIndex(h => /CANTIDAD/.test(h)), iu = IH.findIndex(h => /UBICA/.test(h));
  const plan = new Map(); // sap -> { stock, ubic }
  for (const r of inv.slice(ih + 1)) {
    const s = String(r[im] || '').trim(); if (!isSap(s)) continue;
    const q = Number(r[iq]) || 0; const u = String(r[iu] || '').trim();
    const cur = plan.get(s) || { stock: 0, ubic: '' };
    cur.stock += q; if (!cur.ubic && u) cur.ubic = u;
    plan.set(s, cur);
  }
  // ── Clasificacion: ubic fallback ──
  const cla = rowsOf(wb, 'Clasificacion');
  const ch = cla.findIndex(r => r.some(c => /^material$/i.test(String(c).trim())));
  if (ch >= 0) {
    const CH = cla[ch].map(c => String(c).toUpperCase());
    const cm = CH.findIndex(h => /^MATERIAL$/.test(h.trim())), cu = CH.findIndex(h => /UBICA/.test(h));
    for (const r of cla.slice(ch + 1)) {
      const s = String(r[cm] || '').trim(); if (!isSap(s)) continue;
      const u = String(r[cu] || '').trim(); if (!u) continue;
      const cur = plan.get(s) || { stock: 0, ubic: '' };
      if (!cur.ubic) { cur.ubic = u; plan.set(s, cur); }
    }
  }

  // ── maestro + bodega actuales ──
  const [repSnap, bodSnap] = await Promise.all([db.collection('repuestos').get(), db.collection('bodega').get()]);
  const maestroSap = new Set(); repSnap.forEach(d => { const s = String(d.data().codigoSAP || '').trim(); if (isSap(s)) maestroSap.add(s); });
  const bodExisting = new Map(); bodSnap.forEach(d => bodExisting.set(String(d.data().codigoSAP || d.id).trim(), d));

  // ── construir acciones ──
  let nuevos = 0, actualizados = 0, fueraDeMaestro = 0, conStock = 0, conUbic = 0;
  const ops = [];
  for (const [sap, { stock, ubic }] of plan) {
    if (!maestroSap.has(sap)) { fueraDeMaestro++; continue; }
    if (stock > 0) conStock++; if (ubic) conUbic++;
    const exists = bodExisting.get(sap);
    if (exists) { actualizados++; ops.push({ ref: exists.ref, data: { stockActual: stock, ubicacionBodega: ubic, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, merge: true }); }
    else { nuevos++; ops.push({ ref: db.collection('bodega').doc(sap), data: { codigoSAP: sap, stockActual: stock, stockMinimo: 0, ubicacionBodega: ubic, unidad: 'pzas', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, merge: false }); }
  }

  console.log('=== IMPORT STOCK→BODEGA ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===');
  console.log('SAP en Excel con dato:', plan.size);
  console.log('  → en maestro (se importan):', nuevos + actualizados, `(${nuevos} nuevos en bodega, ${actualizados} actualizan existentes)`);
  console.log('  → fuera del maestro (se omiten):', fueraDeMaestro);
  console.log('  con stock>0:', conStock, '| con ubicación:', conUbic);
  console.log('  bodega antes:', bodSnap.size, 'docs');

  if (!WRITE) { console.log('\nDRY-RUN: no se escribió nada. Corré con --write para aplicar.'); process.exit(0); }

  let done = 0;
  const batchSize = 400;
  for (let i = 0; i < ops.length; i += batchSize) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + batchSize)) op.merge ? batch.set(op.ref, op.data, { merge: true }) : batch.set(op.ref, op.data);
    await batch.commit(); done += Math.min(batchSize, ops.length - i);
    console.log('  escritos', done, '/', ops.length);
  }
  console.log('LISTO. bodega ahora tendrá ~', bodSnap.size + nuevos, 'docs.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
