const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json",'utf-8'))) });
const db = admin.firestore();
const SAPS = ["3300138378","3300138386","3300138387","3300106148","3300012041","3300116693","3300136598","3300138398","3100027344","3100027142"];
(async () => {
  const snap = await db.collection('equipment').get();
  const crit=new Map(), est=new Map(), tipo=new Map();
  let ejemplo=null;
  for (const d of snap.docs) {
    const e=d.data();
    const c=JSON.stringify(e.criticidad); crit.set(c,(crit.get(c)||0)+1);
    est.set(e.estado,(est.get(e.estado)||0)+1);
    if (!ejemplo) ejemplo={id:d.id, criticidad:e.criticidad, estado:e.estado, nombre:e.nombre, codigo:e.codigo, tipo:e.tipo};
  }
  console.log('valores de criticidad:'); [...crit.entries()].forEach(([k,v])=>console.log('  ',k,'->',v));
  console.log('valores de estado:'); [...est.entries()].forEach(([k,v])=>console.log('  ',k,'->',v));
  console.log('ejemplo:', JSON.stringify(ejemplo));
  process.exit(0);
})();
