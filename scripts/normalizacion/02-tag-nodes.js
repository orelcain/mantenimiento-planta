#!/usr/bin/env node
/**
 * FASE 1 — Tipar la jerarquía (aditivo, NO crea ni mueve nodos)
 *
 * Setea `tipoNodo: 'area' | 'equipo'` en cada doc de `hierarchy`, derivado del código:
 *   - código numérico (720004…)        → 'equipo'
 *   - código alfanumérico (AQ-IN-…)    → 'area'
 *   - sin código                       → 'equipo' (los 6 nodos sin código son
 *     cintas/impresora aceptadas como equipo; así los trata ya la UI)
 *
 * No toca ningún otro campo (ni actualizadoEn). Idempotente: solo escribe docs
 * cuyo tipoNodo falta o difiere.
 *
 * Uso:
 *   node scripts/normalizacion/02-tag-nodes.js           ← DRY-RUN (no escribe)
 *   node scripts/normalizacion/02-tag-nodes.js --write   ← aplica los cambios
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Conexión (mismo patrón que el resto de scripts del proyecto) ──
const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error('❌ Falta serviceAccountKey.json en la raíz (o GOOGLE_APPLICATION_CREDENTIALS).');
  process.exit(1);
}
const db = admin.firestore();

const WRITE = process.argv.includes('--write');

const deriveTipo = (codigo) => {
  const c = (codigo || '').trim();
  if (!c) return 'equipo';
  return /^\d+$/.test(c) ? 'equipo' : 'area';
};

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 1 — TIPAR JERARQUÍA ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  const snap = await db.collection('hierarchy').get();
  const counts = { area: 0, equipo: 0 };
  const sinCodigo = [];
  const yaCorrectos = [];
  const aEscribir = []; // { ref, id, nombre, codigo, tipoNodo }

  for (const doc of snap.docs) {
    const d = doc.data();
    const tipo = deriveTipo(d.codigo);
    counts[tipo]++;
    if (!(d.codigo || '').trim()) sinCodigo.push({ id: doc.id, nombre: d.nombre, tipo });
    if (d.tipoNodo === tipo) {
      yaCorrectos.push(doc.id);
    } else {
      aEscribir.push({ ref: doc.ref, id: doc.id, nombre: d.nombre, codigo: d.codigo || '', tipoNodo: tipo, tipoNodoAnterior: d.tipoNodo ?? null });
    }
  }

  console.log(`\nNodos totales: ${snap.size}`);
  console.log(`  → 'area':   ${counts.area}`);
  console.log(`  → 'equipo': ${counts.equipo} (incluye ${sinCodigo.length} sin código)`);
  console.log(`Ya correctos (sin cambio): ${yaCorrectos.length}`);
  console.log(`Docs a escribir: ${aEscribir.length}`);

  console.log('\nNodos sin código (quedan como equipo):');
  for (const n of sinCodigo) console.log(`  - "${n.nombre}" (${n.id})`);

  // Reporte para revisión/auditoría
  const report = {
    timestamp: new Date().toISOString(),
    modo: WRITE ? 'write' : 'dry-run',
    totales: { nodos: snap.size, ...counts, yaCorrectos: yaCorrectos.length, aEscribir: aEscribir.length },
    sinCodigo,
    cambios: aEscribir.map(({ id, nombre, codigo, tipoNodo, tipoNodoAnterior }) => ({ id, nombre, codigo, tipoNodo, tipoNodoAnterior })),
  };
  const reportPath = path.join(__dirname, '02-tag-nodes-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReporte: ${path.relative(ROOT, reportPath)}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Ninguna escritura. Revisar reporte y correr con --write para aplicar.\n');
    process.exit(0);
  }

  // Escritura en lotes de 500 (límite de batch de Firestore)
  let written = 0;
  for (let i = 0; i < aEscribir.length; i += 500) {
    const batch = db.batch();
    for (const { ref, tipoNodo } of aEscribir.slice(i, i + 500)) {
      batch.update(ref, { tipoNodo });
    }
    await batch.commit();
    written += Math.min(500, aEscribir.length - i);
    console.log(`  …${written}/${aEscribir.length} escritos`);
  }

  // Verificación post-escritura
  const verify = await db.collection('hierarchy').get();
  const pendientes = verify.docs.filter((doc) => doc.data().tipoNodo !== deriveTipo(doc.data().codigo));
  console.log(`\n✓ Escritura completa: ${written} docs. Verificación: ${pendientes.length === 0 ? 'todos los nodos tienen tipoNodo correcto ✓' : `⚠ ${pendientes.length} nodos inconsistentes`}`);
  process.exit(pendientes.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
