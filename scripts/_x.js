const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json",'utf-8'))) });
const db = admin.firestore();
const SAPS = ["3300138378","3300138386","3300138387","3300106148","3300012041","3300116693","3300136598","3300138398","3100027344","3100027142"];
(async () => {
  const eq = await db.collection('equipment').get();
  // 1) repuestos por equipo (nodeId)
  const rep = await db.collectionGroup('repuestos').get();
  const porNodo = new Map();
  for (const d of rep.docs) { const r=d.data(); for (const n of (r.equipos||[])) porNodo.set(n,(porNodo.get(n)||0)+1); }
  // 2) trabajos / notas / mediciones
  const cuenta = async (col, campo) => { try { const s=await db.collection(col).get(); const m=new Map();
      for(const d of s.docs){ const v=d.data()[campo]; if(v) m.set(v,(m.get(v)||0)+1);} return m; } catch(e){ return new Map(); } };
  const wo = await cuenta('workOrders','equipmentId');
  const notas = await cuenta('equipmentNotes','equipmentId');
  const med = await cuenta('mediciones','equipmentId');
  let conRep=0, conWo=0, conNotas=0, conMed=0, conFotos=0, conTipo=0, conPath=0;
  const detalle=[];
  for (const d of eq.docs) {
    const e=d.data(); const n=e.hierarchyNodeId;
    const nr=porNodo.get(n)||0;
    if(nr) conRep++;
    if(wo.get(d.id)) conWo++;
    if(notas.get(d.id)) conNotas++;
    if(med.get(d.id)) conMed++;
    if((e.photos||[]).length) conFotos++;
    if(e.tipo) conTipo++;
    if(e.hierarchyPath) conPath++;
    if(nr>50) detalle.push({cod:e.codigo, nom:(e.nombre||'').slice(0,30), rep:nr, tipo:e.tipo});
  }
  const n=eq.size, pct=x=>`${x} (${(x*100/n).toFixed(0)}%)`;
  console.log('equipos:', n);
  console.log('con repuestos vinculados :', pct(conRep));
  console.log('con tipo (familia)       :', pct(conTipo));
  console.log('con ruta de jerarquia    :', pct(conPath));
  console.log('con ordenes de trabajo   :', pct(conWo));
  console.log('con notas                :', pct(conNotas));
  console.log('con mediciones           :', pct(conMed));
  console.log('con fotos                :', pct(conFotos));
  console.log('');
  console.log('equipos con mas de 50 repuestos:', detalle.length);
  detalle.sort((a,b)=>b.rep-a.rep).slice(0,6).forEach(x=>console.log('  ', JSON.stringify(x)));
  process.exit(0);
})();
