/** probe-5-materiales (READ-ONLY): estado en maestro + data del Excel para los 5 SAP. */
const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FILE = 'C:/Users/orelc/OneDrive/ANTARFOOD/INVENTARIO/STOCK ALMACENES.xlsx';
const SAPS = ['3300033144', '3300139135', '3300104815', '3300139470', '3300101498'];

(async () => {
  // estado en maestro
  console.log('=== EN MAESTRO `repuestos`? ===');
  for (const sap of SAPS) {
    const d = await db.collection('repuestos').doc(sap).get();
    let alt = 0;
    if (!d.exists) { const q = await db.collection('repuestos').where('codigoSAP', '==', sap).get(); alt = q.size; }
    console.log(`  ${sap}: ${d.exists ? 'EXISTE (docId=SAP)' : (alt ? `existe ${alt} por campo` : 'NO está')}`);
  }
  // data del Excel (todas las hojas, filas que contengan el SAP)
  const wb = XLSX.readFile(FILE);
  console.log('\n=== FILAS EN EL EXCEL ===');
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
    for (const r of rows) {
      const joined = r.map(c => String(c)).join(' | ');
      for (const sap of SAPS) {
        if (joined.includes(sap)) { console.log(`  [${sheet}] ${joined.slice(0, 160)}`); break; }
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
