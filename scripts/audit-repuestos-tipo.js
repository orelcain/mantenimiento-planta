#!/usr/bin/env node
/**
 * Audit read-only — distribución del campo `tipo` en machines/{id}/repuestos.
 * No escribe nada. Sirve para dimensionar el filtro "Tipo ▾" de F5 (área-first).
 *
 * Uso: node scripts/audit-repuestos-tipo.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

try {
  const saPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(saPath)) {
    config = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
    console.log('✅ serviceAccountKey.json encontrada');
  }
  if (!admin.apps.length) {
    admin.initializeApp(config ? { credential: admin.credential.cert(config) } : {});
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

(async () => {
  const machinesSnap = await db.collection('machines').get();
  const tipoCount = new Map();
  let totalRep = 0;
  let conSAP = 0;
  let machinesConRep = 0;

  for (const m of machinesSnap.docs) {
    const repSnap = await db.collection('machines').doc(m.id).collection('repuestos').get();
    if (repSnap.size > 0) machinesConRep++;
    repSnap.forEach((r) => {
      const d = r.data();
      totalRep++;
      if ((d.codigoSAP || '').trim()) conSAP++;
      const t = (d.tipo || '').trim() || '(vacío)';
      tipoCount.set(t, (tipoCount.get(t) || 0) + 1);
    });
  }

  const sorted = [...tipoCount.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n📦 machines totales: ${machinesSnap.size} · con repuestos: ${machinesConRep}`);
  console.log(`🔧 repuestos totales: ${totalRep} · con SAP: ${conSAP} (${((conSAP / totalRep) * 100).toFixed(1)}%)`);
  console.log(`\n🏷️  Distribución de \`tipo\` (${tipoCount.size} valores distintos):`);
  let acc = 0;
  for (const [t, n] of sorted) {
    acc++;
    const pct = ((n / totalRep) * 100).toFixed(1);
    console.log(`   ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${t}`);
    if (acc >= 40) { console.log(`   … y ${sorted.length - 40} valores más`); break; }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
