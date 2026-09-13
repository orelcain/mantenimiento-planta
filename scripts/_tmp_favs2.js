const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json",'utf-8'))) });
const db = admin.firestore();
const SAPS = ["3300138378","3300138386","3300138387","3300106148","3300012041","3300116693","3300136598","3300138398","3100027344","3100027142"];
(async () => {
  for (const u of ["sIXdQHw0q8aCxJk90WSeryszQoO2","y2B2X0MqHGWBb5DU02910S4euxp2"]) {
    const d = await db.collection('users').doc(u).get();
    console.log('USER', u, d.exists ? JSON.stringify({n:d.data().nombre||d.data().name||d.data().displayName, e:d.data().email}) : 'no existe');
  }
  const snap = await db.collectionGroup('repuestos').get();
  console.log('total repuestos docs:', snap.size);
  const found = new Map();
  for (const d of snap.docs) {
    const r = d.data();
    const sap = (r.codigoSAP||'').trim();
    if (SAPS.includes(sap)) {
      if (!found.has(sap)) found.set(sap, []);
      found.get(sap).push({ path: d.ref.path, texto: r.textoBreve, tipo: r.tipo||'', fab: r.codigoFabricante||'',
        desc: (r.descripcion||'').slice(0,80), specs: r.technicalSpecs ? Object.keys(r.technicalSpecs.standardValues||{}).length + '+' + (r.technicalSpecs.customFields||[]).length : null,
        equipos: (r.equipos||[]).length, valor: r.valorUnitario, um: r.unidadMedida||r.unidad||'' });
    }
  }
  for (const sap of SAPS) {
    const v = found.get(sap);
    console.log('\n===', sap, v ? `(${v.length} doc)` : 'NO ENCONTRADO');
    (v||[]).forEach(x => console.log('   ', JSON.stringify(x)));
  }
  process.exit(0);
})();
