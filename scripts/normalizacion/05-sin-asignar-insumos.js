#!/usr/bin/env node
/**
 * FASE 3b — machines/sin-asignar/repuestos → insumos (solo los que faltan)
 *
 * De los 855 ítems huérfanos bajo machines/sin-asignar (inventario 3100…,
 * herramientas/insumos), agrega a la colección `insumos` SOLO los que aún no
 * existen ahí (~121). Aprobado por el usuario el 2026-06-11: "121 a insumos,
 * resto nada" (los 855 originales se eliminan con machines en Fase 5; backup
 * en backups/normalizacion-2026-06-10T23-53-21/machines__repuestos_huerfanos.json).
 *
 * docId = codigoSAP (igual que el resto de insumos). Idempotente: si ya existe
 * en insumos, no se toca.
 *
 * Uso:
 *   node scripts/normalizacion/05-sin-asignar-insumos.js           ← DRY-RUN
 *   node scripts/normalizacion/05-sin-asignar-insumos.js --write   ← aplica
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else {
  console.error('❌ Falta serviceAccountKey.json en la raíz.');
  process.exit(1);
}
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const isRealSap = (s) => /^\d{6,}$/.test((s || '').trim());

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 3b — sin-asignar → insumos ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  const saSnap = await db.collection('machines').doc('sin-asignar').collection('repuestos').get();
  const insSnap = await db.collection('insumos').get();
  const insSaps = new Set(insSnap.docs.map((d) => (d.data().codigoSAP || d.id || '').trim()));

  const nuevos = [];
  let yaExisten = 0, sinSap = 0;
  for (const d of saSnap.docs) {
    const r = d.data();
    const sap = (r.codigoSAP || '').trim();
    if (!isRealSap(sap)) { sinSap++; continue; }
    if (insSaps.has(sap)) { yaExisten++; continue; }
    nuevos.push({
      id: sap,
      codigoSAP: sap,
      textoBreve: r.textoBreve || r.descripcion || '',
      unidadMedida: 'UN',
      familia: 'SIN CLASIFICAR',
      subFamilia: '',
      status: 'activo',
      existeEnRepuestos: false,
      stockFisico: null,
      ubicacion: null,
      ubicacionFisica: null,
      almacen: null,
      importedFrom: 'machines/sin-asignar (normalizacion 2026-06-11)',
    });
  }

  console.log(`\nsin-asignar: ${saSnap.size} docs | ya en insumos: ${yaExisten} | sin SAP: ${sinSap}`);
  console.log(`Nuevos a agregar a insumos: ${nuevos.length}`);
  for (const n of nuevos.slice(0, 10)) console.log(`  - ${n.codigoSAP} "${n.textoBreve}"`);
  if (nuevos.length > 10) console.log(`  … y ${nuevos.length - 10} más`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Ninguna escritura.\n');
    process.exit(0);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  for (let i = 0; i < nuevos.length; i += 400) {
    const batch = db.batch();
    for (const n of nuevos.slice(i, i + 400)) {
      batch.set(db.collection('insumos').doc(n.id), { ...n, createdAt: now, updatedAt: now });
    }
    await batch.commit();
  }
  const verify = await db.collection('insumos').get();
  console.log(`\n✓ ${nuevos.length} insumos agregados. Colección insumos: ${verify.size} docs (antes ${insSnap.size}).`);
  process.exit(0);
})().catch((e) => { console.error('❌ Error:', e.message); process.exit(1); });
