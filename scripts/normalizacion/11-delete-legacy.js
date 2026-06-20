#!/usr/bin/env node
/**
 * FASE 5 — Borrado de colecciones legacy.
 *
 * Borra (recursivo, incl. documentos "fantasma" con subcolecciones huérfanas):
 *   - insumos              (absorbido en el maestro `repuestos`)
 *   - machines             (+ machines/* /repuestos y huérfanas sin-asignar/multivac/SW2RNI*)
 *   - plantAssets          (migrado a `repuestos` / capa de mapa retirada)
 *   - repuestosBaader200   (legacy)
 *   - hierarchy/* /repuestos (repuestos viejos colgados de la jerarquía; NO borra hierarchy)
 *
 * Seguridad:
 *   - DRY-RUN por defecto: solo cuenta, no borra.
 *   - --write exige que exista una carpeta backups/fase5-* (correr antes 10-backup-fase5.js).
 *
 *   node scripts/normalizacion/11-delete-legacy.js           ← DRY-RUN
 *   node scripts/normalizacion/11-delete-legacy.js --write    ← borra
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) { console.error('❌ Falta serviceAccountKey.json en la raíz.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const WRITE = process.argv.includes('--write');
const TOP_LEVEL = ['insumos', 'machines', 'plantAssets', 'repuestosBaader200'];

// Cuenta eficiente: docs reales (query) + subcolección 'repuestos' por cada ref
// (incl. parents fantasma vía listDocuments). 1 query por colección/parent.
async function countCollection(col) {
  const real = (await db.collection(col).get()).size;
  let sub = 0;
  for (const r of await db.collection(col).listDocuments()) {
    sub += (await r.collection('repuestos').get()).size;
  }
  return real + sub;
}

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log('FASE 5 — BORRADO legacy ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)'));
  console.log('='.repeat(64));

  if (WRITE) {
    const backups = fs.existsSync(path.join(ROOT, 'backups'))
      ? fs.readdirSync(path.join(ROOT, 'backups')).filter(d => d.startsWith('fase5-'))
      : [];
    if (backups.length === 0) {
      console.error('❌ No hay backup fase5-* en backups/. Corré primero 10-backup-fase5.js. Abortado.');
      process.exit(1);
    }
    console.log('  Backup encontrado:', backups.sort().pop());
  }

  // Conteo previo
  const counts = {};
  for (const col of TOP_LEVEL) { counts[col] = await countCollection(col); console.log(`  ${col.padEnd(20)} ${counts[col]} docs`); }
  // hierarchy/*/repuestos
  let hierRep = 0;
  const hRefs = await db.collection('hierarchy').listDocuments();
  for (const hr of hRefs) { const s = await hr.collection('repuestos').get(); hierRep += s.size; }
  console.log(`  ${'hierarchy/*/repuestos'.padEnd(20)} ${hierRep} docs`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + hierRep;
  console.log(`  ── TOTAL a borrar: ${total} docs`);

  if (!WRITE) { console.log('\nDRY-RUN: nada borrado. Corré con --write (tras backup) para aplicar.\n'); process.exit(0); }

  console.log('\nBorrando…');
  for (const col of TOP_LEVEL) {
    for (const r of await db.collection(col).listDocuments()) await db.recursiveDelete(r);
    console.log(`  ✓ ${col} borrado`);
  }
  for (const hr of hRefs) await db.recursiveDelete(hr.collection('repuestos'));
  console.log(`  ✓ hierarchy/*/repuestos borrado`);

  console.log('\n✓ Borrado completo. (Backup en backups/fase5-*.)\n');
  process.exit(0);
})().catch(e => { console.error('❌ Error:', e); process.exit(1); });
