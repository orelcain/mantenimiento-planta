#!/usr/bin/env node
/**
 * 99-stats-maestro — SOLO LECTURA. Radiografía del maestro `repuestos` hoy.
 * No escribe nada. Reporta buckets para decidir el foco SAP-first.
 *
 *   node scripts/normalizacion/99-stats-maestro.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else {
  console.error('Falta serviceAccountKey.json');
  process.exit(1);
}
const db = admin.firestore();
const isSap = (s) => /^\d{6,}$/.test((s || '').trim());

(async () => {
  const [repSnap, bodegaSnap, hierSnap] = await Promise.all([
    db.collection('repuestos').get(),
    db.collection('bodega').get(),
    db.collection('hierarchy').get(),
  ]);

  // stock por SAP en bodega
  const stockSap = new Set();
  bodegaSnap.forEach((d) => {
    const x = d.data();
    const sap = x.codigoSAP || d.id;
    if (isSap(sap)) stockSap.add(String(sap).trim());
  });

  const equipoNodes = new Set();
  hierSnap.forEach((d) => { if (d.data().tipoNodo === 'equipo') equipoNodes.add(d.id); });

  let total = 0, conSap = 0, sinSap = 0;
  let conSapConEquipo = 0, conSapSinEquipo = 0, conSapConStock = 0;
  let conSapConStockConEquipo = 0;
  let conFoto = 0, conSapConStockSinFoto = 0;
  const porClase = {};
  let placeholderSap = 0;

  repSnap.forEach((d) => {
    const r = d.data();
    total++;
    const clase = r.clase || '(sin clase)';
    porClase[clase] = (porClase[clase] || 0) + 1;

    const sap = (r.codigoSAP || '').trim();
    const tiene = isSap(sap);
    if ((r.codigoSAP || '').toLowerCase() === 'pendiente') placeholderSap++;

    const equipos = Array.isArray(r.equipos) ? r.equipos.filter(Boolean) : [];
    const tieneEquipo = equipos.length > 0;
    const tieneFoto = Array.isArray(r.fotosReales) && r.fotosReales.length > 0;
    if (tieneFoto) conFoto++;

    if (tiene) {
      conSap++;
      if (tieneEquipo) conSapConEquipo++; else conSapSinEquipo++;
      if (stockSap.has(sap)) {
        conSapConStock++;
        if (tieneEquipo) conSapConStockConEquipo++;
        if (!tieneFoto) conSapConStockSinFoto++;
      }
    } else {
      sinSap++;
    }
  });

  // stock huérfano: SAP en bodega sin doc en repuestos
  const repSapSet = new Set();
  repSnap.forEach((d) => { const s = (d.data().codigoSAP || '').trim(); if (isSap(s)) repSapSet.add(s); });
  let stockHuerfano = 0;
  stockSap.forEach((s) => { if (!repSapSet.has(s)) stockHuerfano++; });

  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
  console.log('\n===== MAESTRO repuestos — radiografía =====');
  console.log(`Total docs ......................... ${total}`);
  console.log(`  con SAP (tier 1, ordenable) ...... ${conSap}  (${pct(conSap)})`);
  console.log(`  sin SAP (tier 2, despiece) ....... ${sinSap}  (${pct(sinSap)})`);
  console.log(`  con foto real .................... ${conFoto}`);
  console.log(`  placeholder "Pendiente" .......... ${placeholderSap}`);
  console.log('\n--- dentro de con-SAP ---');
  console.log(`  con equipo asignado .............. ${conSapConEquipo}`);
  console.log(`  SIN equipo (backlog asignar-eq) .. ${conSapSinEquipo}`);
  console.log(`  con stock en bodega .............. ${conSapConStock}   <- NÚCLEO`);
  console.log(`     ...de esos, con equipo ........ ${conSapConStockConEquipo}`);
  console.log(`     ...de esos, SIN foto .......... ${conSapConStockSinFoto}`);
  console.log('\n--- bodega ---');
  console.log(`  SAP únicos con stock ............. ${stockSap.size}`);
  console.log(`  stock huérfano (SAP sin doc) ..... ${stockHuerfano}`);
  console.log('\n--- por clase ---');
  Object.entries(porClase).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));
  console.log('\n--- hierarchy ---');
  console.log(`  nodos equipo ..................... ${equipoNodes.size}`);
  console.log('==========================================\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
