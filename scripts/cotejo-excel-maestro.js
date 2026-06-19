/**
 * cotejo-excel-maestro — DIAGNÓSTICO solo-lectura.
 * Coteja cada hoja-máquina de Maestro_Repuestos_Completo_v3.xlsx contra el
 * maestro `repuestos` de la app: a qué nodo(s) de hierarchy caen sus SAP,
 * cuántos calzan, y cuánta data de stock/ubicación trae el Excel para importar.
 */
const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const isSap = s => /^\d{6,}$/.test(String(s || '').trim());
const norm = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
const XLSX_PATH = 'C:/Users/orelc/OneDrive/ANTARFOOD/INVENTARIO/Maestro_Repuestos_Completo_v3.xlsx';
const SHEETS = ['Baader 142','Baader 200','Det. Metales','Fishken','GEA V2','Garibaldi','Grader','Videojet','Knuro','M. Eviscerado','M. Filete'];

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hdr = rows.findIndex(r => r.some(c => /C[OÓ]D\.?\s*M[AÁ]QUINA/i.test(String(c))));
  if (hdr < 0) return null;
  const H = rows[hdr].map(norm);
  const col = (re) => H.findIndex(h => re.test(h));
  const iDesc = col(/^DESCRIPCI/), iSap = col(/^C[OÓ]D\.?\s*SAP$/), iStock = col(/^STOCK$/), iUbic = col(/^UBICAC/);
  const items = [];
  for (const r of rows.slice(hdr + 1)) {
    if (!String(r[iDesc] || '').trim()) continue;
    items.push({ desc: r[iDesc], sap: String(r[iSap] || '').trim(), stock: Number(r[iStock]) || 0, ubic: String(r[iUbic] || '').trim() });
  }
  return items;
}

(async () => {
  // Cargar app una vez
  const hier = await db.collection('hierarchy').get();
  const nodeName = new Map(); hier.forEach(d => nodeName.set(d.id, d.data().alias || d.data().nombre || d.id));
  const repSnap = await db.collection('repuestos').get();
  const sapEquipos = new Map(); // sap -> [nodeIds]
  repSnap.forEach(d => { const r = d.data(); const s = String(r.codigoSAP || '').trim(); if (isSap(s)) sapEquipos.set(s, (r.equipos || [])); });

  const wb = XLSX.readFile(XLSX_PATH);
  console.log('HOJA              | ítems | cSAP | enApp | nodo dominante (#)                         | stock | ubic');
  console.log('------------------|-------|------|-------|--------------------------------------------|-------|-----');
  let totSap=0, totStock=0, totUbic=0;
  for (const sh of SHEETS) {
    const items = parseSheet(wb.Sheets[sh]); if (!items) { console.log(sh, 'sin header'); continue; }
    const saps = [...new Set(items.filter(i => isSap(i.sap)).map(i => i.sap))];
    const stockN = items.filter(i => isSap(i.sap) && i.stock > 0).length;
    const ubicN = items.filter(i => isSap(i.sap) && i.ubic).length;
    let enApp = 0; const nodeTally = {};
    for (const s of saps) {
      const eq = sapEquipos.get(s);
      if (eq) { enApp++; for (const id of eq) { const nm = nodeName.get(id) || id; nodeTally[nm] = (nodeTally[nm] || 0) + 1; } }
    }
    const top = Object.entries(nodeTally).sort((a, b) => b[1] - a[1])[0];
    const topStr = top ? `${top[0].slice(0,38)} (${top[1]})` : '—';
    console.log(`${sh.padEnd(17)} | ${String(items.length).padStart(5)} | ${String(saps.length).padStart(4)} | ${String(enApp).padStart(5)} | ${topStr.padEnd(42)} | ${String(stockN).padStart(5)} | ${String(ubicN).padStart(4)}`);
    totSap += saps.length; totStock += stockN; totUbic += ubicN;
  }
  console.log('------------------|-------|------|-------|--------------------------------------------|-------|-----');
  console.log(`TOTALES                   ${String(totSap).padStart(4)}                                                              ${String(totStock).padStart(5)} | ${String(totUbic).padStart(4)}`);
  console.log('\nNOTA: "nodo dominante" = nodo de hierarchy donde caen más SAP de esa hoja. stock/ubic = SAP de la hoja con ese dato en el Excel (potencial de import).');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
