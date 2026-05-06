#!/usr/bin/env node
/**
 * Dry-run importer del Excel STOCK ALMACENES.xlsx → futura colección `insumos`.
 *
 * Lee:
 *   - Hoja "Clasificacion"             → catálogo maestro (3448 SAPs)
 *   - Hoja "MATERIALES QUE SE QUEDAN"  → stock físico real (~308 SAPs)
 *   - collectionGroup('repuestos')     → para detectar overlap con catálogo de repuestos
 *
 * Imprime resumen. Por defecto NO escribe Firestore (modo dry-run).
 *
 * Uso:
 *   node scripts/import-insumos.js                    (dry-run con cruce repuestos)
 *   node scripts/import-insumos.js --no-firestore     (dry-run sin cruce)
 *   node scripts/import-insumos.js --apply            (ESCRIBE colección insumos)
 *   node scripts/import-insumos.js --apply --limit 10 (escribe solo 10 — para prueba)
 *   node scripts/import-insumos.js --file "<ruta>"    (override Excel path)
 */

const path = require('path');
const fs   = require('fs');
const XLSX = require('xlsx');

// ─── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_FILE = 'C:/Users/pc hp/OneDrive/ANTARFOOD/INVENTARIO/STOCK ALMACENES.xlsx';
const SHEET_CLAS   = 'Clasificacion';
const SHEET_STOCK  = 'MATERIALES QUE SE QUEDAN';

const args = process.argv.slice(2);
const NO_FIRESTORE = args.includes('--no-firestore');
const APPLY        = args.includes('--apply');
const fileIdx  = args.indexOf('--file');
const limitIdx = args.indexOf('--limit');
const FILE  = fileIdx  !== -1 && args[fileIdx  + 1] ? args[fileIdx  + 1] : DEFAULT_FILE;
const LIMIT = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 0;

// Catálogo de huérfanos detectados (formato no-SAP estándar) — se reportan pero no se importan
const SAP_NON_STANDARD_PATTERN = /^\d+-\d+$/; // "516-10011" etc.

const VALID_FAMILIAS = new Set([
  'REPUESTOS','INSUMOS_MANT','AREA','REFRIGERACION','QUIMICOS',
  'HERRAMIENTAS','EMPAQUE','COMBUSTIBLE','LUBRICANTES',
]);
const STATUS_MAP = { ACTIVO: 'activo', OBSOLETO: 'obsoleto', TRASLADAR: 'trasladar' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function norm(v, fb = '') {
  if (v === undefined || v === null) return fb;
  return String(v).trim();
}
function normSAP(v) {
  // Excel a veces convierte SAPs a número (ej "10024235" → 10024235.0)
  return norm(v).replace(/\.0+$/, '').replace(/\s+/g, '');
}
function pad(n, w = 5) { return String(n).padStart(w, ' '); }
function pct(part, total) { return total ? `${(part * 100 / total).toFixed(1)}%` : '—'; }

// ─── Lectura: Clasificacion ──────────────────────────────────────────────────
function readClasificacion(wb) {
  const sheet = wb.Sheets[SHEET_CLAS];
  if (!sheet) throw new Error(`Hoja "${SHEET_CLAS}" no encontrada`);

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  if (!rows.length) throw new Error(`Hoja "${SHEET_CLAS}" vacía`);

  // Header en fila 0. Headers reales: "material", "texto breve de material",
  // "unidad medida base", "familia", "sub-familia", "ubicación", "status".
  // Algunos headers traen \n internos ("unidad medida\nbase"), así que colapsamos whitespace.
  const header = rows[0].map(h => norm(h).toLowerCase().replace(/\s+/g, ' '));
  const idx = {
    sap:        header.findIndex(h => h === 'material' || h === 'sap'),
    texto:      header.findIndex(h => h === 'texto breve de material' || h === 'texto' || h === 'texto breve' || h === 'descripcion'),
    unidad:     header.findIndex(h => h === 'unidad medida base' || h === 'unidad' || h === 'umb'),
    familia:    header.findIndex(h => h === 'familia'),
    subfamilia: header.findIndex(h => h === 'sub-familia' || h === 'subfamilia' || h === 'sub familia'),
    ubicacion:  header.findIndex(h => h === 'ubicación' || h === 'ubicacion'),
    status:     header.findIndex(h => h === 'status' || h === 'estado'),
  };

  const missing = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
  if (missing.length) {
    console.error('Headers vistos:', header.filter(Boolean).slice(0, 30).join(' | '));
    throw new Error(`Columnas faltantes en "${SHEET_CLAS}": ${missing.join(', ')}`);
  }

  const out = [];
  const seenSap = new Map(); // sap → primer item visto (para detectar duplicados)
  const duplicados = [];     // [{ sap, texto, familia, count }]
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sap = normSAP(r[idx.sap]);
    if (!sap) continue;
    const item = {
      sap,
      texto:      norm(r[idx.texto]),
      unidad:     norm(r[idx.unidad]),
      familia:    norm(r[idx.familia]).toUpperCase(),
      subfamilia: norm(r[idx.subfamilia]),
      ubicacion:  norm(r[idx.ubicacion]),
      status:     norm(r[idx.status]).toUpperCase() || 'ACTIVO',
    };
    if (seenSap.has(sap)) {
      duplicados.push({ sap, texto: item.texto, familia: item.familia });
      // En --apply, el último gana (set merge:true). Reemplazamos en out
      // para que los conteos del dry-run coincidan con lo que realmente queda.
      const existingIdx = out.findIndex(o => o.sap === sap);
      if (existingIdx !== -1) out[existingIdx] = item;
      continue;
    }
    seenSap.set(sap, item);
    out.push(item);
  }
  out.duplicados = duplicados; // adjunto como propiedad para reportar
  return out;
}

// ─── Lectura: MATERIALES QUE SE QUEDAN ───────────────────────────────────────
function readStockReal(wb) {
  const sheet = wb.Sheets[SHEET_STOCK];
  if (!sheet) {
    console.warn(`Aviso: hoja "${SHEET_STOCK}" no encontrada — saltando cruce de stock`);
    return new Map();
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

  // Header puede no estar en fila 0; busca fila con MATERIAL y CANTIDAD
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = rows[i].map(c => norm(c).toUpperCase());
    if (cells.some(c => c === 'MATERIAL') && cells.some(c => c === 'CANTIDAD')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    console.warn(`Aviso: no pude ubicar header MATERIAL/CANTIDAD en "${SHEET_STOCK}"`);
    return new Map();
  }

  const header = rows[headerIdx].map(c => norm(c).toUpperCase());
  const iSap  = header.findIndex(c => c === 'MATERIAL');
  const iCant = header.findIndex(c => c === 'CANTIDAD');
  const iUbi  = header.findIndex(c => c.startsWith('UBICAC'));
  const iAlm  = header.findIndex(c => c === 'ALMACEN' || c === 'ALMACÉN');

  const map = new Map(); // sap → { cantidad, ubicacion, almacen }
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const sap = normSAP(r[iSap]);
    if (!sap) continue;
    const cant = Number(r[iCant]);
    if (!Number.isFinite(cant)) continue;

    const cur = map.get(sap);
    if (cur) {
      cur.cantidad += cant; // suma si el SAP aparece en >1 almacén
    } else {
      map.set(sap, {
        cantidad: cant,
        ubicacion: iUbi !== -1 ? norm(r[iUbi]) : '',
        almacen:   iAlm !== -1 ? norm(r[iAlm]) : '',
      });
    }
  }
  return map;
}

// ─── Firebase Admin singleton ────────────────────────────────────────────────
let _adminCache = null;
function getAdmin() {
  if (_adminCache) return _adminCache;
  const saPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (!fs.existsSync(saPath)) return null;
  let admin;
  try { admin = require('firebase-admin'); } catch { return null; }
  const sa = require(saPath);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  _adminCache = { admin, db };
  return _adminCache;
}

// ─── Cruce con Firestore (machines/*/repuestos vía collectionGroup) ──────────
async function loadRepuestoSAPs() {
  if (NO_FIRESTORE) return null;
  const ctx = getAdmin();
  if (!ctx) {
    console.warn('Aviso: serviceAccountKey.json o firebase-admin no disponible — omitiendo cruce con repuestos');
    return null;
  }
  console.log('Leyendo collectionGroup("repuestos")...');
  const snap = await ctx.db.collectionGroup('repuestos').get();
  const set = new Set();
  snap.forEach(doc => {
    const d = doc.data();
    const sap = normSAP(d.codigoSAP || d.sap || d.codigo || '');
    if (sap) set.add(sap);
  });
  console.log(`  → ${snap.size} docs leídos · ${set.size} SAPs únicos\n`);
  return set;
}

// ─── Apply: escribe colección insumos ────────────────────────────────────────
async function applyToFirestore({ items, stock, repSet }) {
  const ctx = getAdmin();
  if (!ctx) throw new Error('--apply requiere serviceAccountKey.json y firebase-admin');
  const { admin, db } = ctx;
  const col = db.collection('insumos');

  // 1. Pre-leer IDs existentes para preservar createdAt en re-imports
  console.log('Pre-leyendo IDs existentes en colección insumos...');
  const existingSnap = await col.select().get();
  const existingIds = new Set(existingSnap.docs.map(d => d.id));
  console.log(`  → ${existingIds.size} docs ya existentes\n`);

  // 2. Filtrar items importables (SAP estándar + huérfanos descartados ya implícito)
  const toImport = items.filter(it => !SAP_NON_STANDARD_PATTERN.test(it.sap));
  const skippedNonStandard = items.length - toImport.length;
  if (skippedNonStandard > 0) {
    console.log(`  Skipping ${skippedNonStandard} items con SAP no-estándar (formato XXX-XXXX)`);
  }
  const sliced = LIMIT > 0 ? toImport.slice(0, LIMIT) : toImport;
  if (LIMIT > 0) console.log(`  Limitando a ${LIMIT} docs (--limit)\n`);

  // 3. Escribir en batches de 400 (margen sobre límite Firestore 500)
  const now = admin.firestore.FieldValue.serverTimestamp();
  let creados = 0, actualizados = 0, batches = 0;
  let batch = db.batch();
  let opsInBatch = 0;

  for (const it of sliced) {
    const stockEntry = stock.get(it.sap);
    const familia = VALID_FAMILIAS.has(it.familia) ? it.familia : 'SIN_FAMILIA';
    const status  = STATUS_MAP[it.status] || 'activo';
    const isNew   = !existingIds.has(it.sap);

    const doc = {
      id: it.sap,
      codigoSAP: it.sap,
      textoBreve: it.texto || it.sap,
      familia,
      subFamilia: it.subfamilia || null,
      ubicacion: it.ubicacion || null,                 // ubicación de catalogación (Clasificacion)
      ubicacionFisica: stockEntry?.ubicacion || null,  // ubicación física (MATERIALES) ej "CAJA C"
      unidadMedida: it.unidad || null,
      status,
      stockFisico: stockEntry?.cantidad ?? null,
      almacen: stockEntry?.almacen || null,
      existeEnRepuestos: repSet ? repSet.has(it.sap) : null,
      importedFrom: 'STOCK_ALMACENES_xlsx',
      updatedAt: now,
    };
    if (isNew) doc.createdAt = now;

    batch.set(col.doc(it.sap), doc, { merge: true });
    if (isNew) creados++; else actualizados++;
    opsInBatch++;

    if (opsInBatch >= 400) {
      await batch.commit();
      batches++;
      console.log(`  Batch ${batches} commiteado · ${creados + actualizados}/${sliced.length}`);
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
    batches++;
    console.log(`  Batch final ${batches} commiteado · ${creados + actualizados}/${sliced.length}`);
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  APPLY COMPLETO`);
  console.log(`  ${creados} creados · ${actualizados} actualizados · ${batches} batches`);
  if (skippedNonStandard > 0) console.log(`  ${skippedNonStandard} skipped (SAP no-estándar)`);
  console.log('───────────────────────────────────────────────────────────────');
}

// ─── Render resumen ──────────────────────────────────────────────────────────
function printSummary({ items, stock, repSet }) {
  const total = items.length;

  const byStatus = {};
  const byFamilia = {};
  const bySubFamilia = {};
  let conUbi = 0;
  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    const fam = it.familia || '(sin familia)';
    byFamilia[fam] = (byFamilia[fam] || 0) + 1;
    const sub = it.subfamilia || '(sin)';
    bySubFamilia[sub] = (bySubFamilia[sub] || 0) + 1;
    if (it.ubicacion) conUbi++;
  }

  // Cruce con stock real
  const itemsConStock = items.filter(it => stock.has(it.sap));
  const stockHuerfanos = [...stock.keys()].filter(sap => !items.some(it => it.sap === sap));

  // Almacenes
  const byAlmacen = {};
  for (const [, v] of stock) {
    const k = v.almacen || '(sin)';
    byAlmacen[k] = (byAlmacen[k] || 0) + 1;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  DRY-RUN — Importer Insumos · ${total} items leídos · ${stock.size} con stock real`);
  console.log('  (no se escribió nada en Firestore)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('## STATUS');
  Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${pad(v)}  ${k.padEnd(12)}  ${pct(v, total)}`);
  });
  console.log();

  console.log('## FAMILIA');
  Object.entries(byFamilia).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${pad(v)}  ${k.padEnd(16)}  ${pct(v, total)}`);
  });
  console.log();

  console.log('## SUB-FAMILIA (top 15)');
  Object.entries(bySubFamilia).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
    console.log(`  ${pad(v)}  ${k}`);
  });
  console.log();

  console.log('## UBICACIÓN (en Clasificacion)');
  console.log(`  ${pad(conUbi)}  con ubicación asignada (${pct(conUbi, total)})`);
  console.log(`  ${pad(total - conUbi)}  sin ubicación (${pct(total - conUbi, total)})\n`);

  console.log('## STOCK FÍSICO (cruce con MATERIALES QUE SE QUEDAN)');
  console.log(`  ${pad(itemsConStock.length)}  items de Clasificacion con stock real`);
  console.log(`  ${pad(stockHuerfanos.length)}  SAPs en MATERIALES sin entry en Clasificacion (huérfanos)`);
  if (stockHuerfanos.length) {
    console.log(`     Ejemplos: ${stockHuerfanos.slice(0, 6).join(', ')}${stockHuerfanos.length > 6 ? '…' : ''}`);
  }
  if (Object.keys(byAlmacen).length) {
    console.log('  Distribución por almacén:');
    Object.entries(byAlmacen).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`    ${pad(v)}  ${k}`);
    });
  }
  console.log();

  // Status × stock real cross-tab
  console.log('## STATUS × STOCK REAL');
  const matrix = {};
  for (const it of items) {
    const tieneStock = stock.has(it.sap);
    const key = it.status;
    matrix[key] = matrix[key] || { conStock: 0, sinStock: 0 };
    matrix[key][tieneStock ? 'conStock' : 'sinStock']++;
  }
  console.log(`  ${'Status'.padEnd(12)}  ${'con stock'.padStart(10)}  ${'sin stock'.padStart(10)}`);
  Object.entries(matrix).sort((a, b) => (b[1].conStock + b[1].sinStock) - (a[1].conStock + a[1].sinStock)).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(12)}  ${pad(v.conStock, 10)}  ${pad(v.sinStock, 10)}`);
  });
  console.log();

  // Cruce con repuestos
  if (repSet) {
    const overlap = items.filter(it => repSet.has(it.sap));
    const nuevos = items.filter(it => !repSet.has(it.sap));
    const overlapPorFamilia = {};
    for (const it of overlap) {
      overlapPorFamilia[it.familia || '(sin)'] = (overlapPorFamilia[it.familia || '(sin)'] || 0) + 1;
    }
    console.log('## CRUCE CON REPUESTOS (machines/*/repuestos)');
    console.log(`  ${pad(repSet.size)}  SAPs únicos en colección repuestos`);
    console.log(`  ${pad(overlap.length)}  items de Clasificacion ya están como repuesto (${pct(overlap.length, total)})`);
    console.log(`  ${pad(nuevos.length)}  items NUEVOS — solo en Clasificacion (${pct(nuevos.length, total)})\n`);
    console.log('  Overlap desglosado por familia:');
    Object.entries(overlapPorFamilia).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`    ${pad(v)}  ${k}`);
    });
  } else {
    console.log('## CRUCE CON REPUESTOS');
    console.log('  (omitido — flag --no-firestore o falta serviceAccountKey.json)');
  }
  console.log();

  // SAPs no-estándar (descartados en --apply)
  const nonStandard = items.filter(it => SAP_NON_STANDARD_PATTERN.test(it.sap));
  const duplicados = items.duplicados || [];
  if (nonStandard.length || stockHuerfanos.length || duplicados.length) {
    console.log('## WARNINGS');
    if (duplicados.length) {
      console.log(`  ${pad(duplicados.length)}  SAPs DUPLICADOS en Clasificacion (último gana en --apply)`);
      console.log(`     Ejemplos: ${duplicados.slice(0, 4).map(d => `${d.sap} (${d.familia})`).join(', ')}`);
      console.log(`     Recomendado: revisar y consolidar manualmente en el Excel`);
    }
    if (nonStandard.length) {
      console.log(`  ${pad(nonStandard.length)}  con SAP no-estándar (formato XXX-XXXX) — NO se importan`);
      console.log(`     Ejemplos: ${nonStandard.slice(0, 5).map(i => i.sap).join(', ')}`);
    }
    const stockHuerfanosNonStd = stockHuerfanos.filter(s => SAP_NON_STANDARD_PATTERN.test(s));
    if (stockHuerfanosNonStd.length) {
      console.log(`  ${pad(stockHuerfanosNonStd.length)}  SAPs huérfanos en MATERIALES con formato XXX-XXXX`);
      console.log(`     Ejemplos: ${stockHuerfanosNonStd.slice(0, 5).join(', ')}`);
    }
    console.log();
  }

  // Bottom-line
  const importables = items.filter(it => !SAP_NON_STANDARD_PATTERN.test(it.sap));
  const activosConStock = importables.filter(it => it.status === 'ACTIVO' && stock.has(it.sap)).length;
  const activosSinStock = importables.filter(it => it.status === 'ACTIVO' && !stock.has(it.sap)).length;
  const obsoletos = importables.filter(it => it.status === 'OBSOLETO').length;
  const otros = importables.length - activosConStock - activosSinStock - obsoletos;
  console.log('───────────────────────────────────────────────────────────────');
  console.log('## BOTTOM LINE — qué importaríamos en --apply');
  console.log(`  Total a crear en colección insumos:   ${importables.length}  (de ${total} leídos)`);
  console.log(`  ├─ Activos con stock real:            ${activosConStock}`);
  console.log(`  ├─ Activos sin stock (catálogo):      ${activosSinStock}`);
  console.log(`  ├─ Obsoletos (filtrables, no borrar): ${obsoletos}`);
  console.log(`  └─ Otros (TRASLADAR, sin status):     ${otros}`);
  console.log('───────────────────────────────────────────────────────────────');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`Excel no encontrado: ${FILE}`);
  console.log(`Leyendo: ${FILE}`);
  if (APPLY) console.log('MODO --apply: se ESCRIBIRÁ a Firestore');
  else       console.log('MODO dry-run (sin --apply, no escribe Firestore)');
  console.log();

  const wb = XLSX.readFile(FILE);
  console.log(`Hojas en libro: ${wb.SheetNames.length}\n`);

  const items = readClasificacion(wb);
  console.log(`Clasificacion:             ${items.length} items con SAP`);
  const stock = readStockReal(wb);
  console.log(`MATERIALES QUE SE QUEDAN:  ${stock.size} SAPs únicos con stock\n`);

  // En --apply forzamos cargar repSet (ignoramos --no-firestore que no tiene sentido)
  const repSet = await loadRepuestoSAPs();

  printSummary({ items, stock, repSet });

  if (APPLY) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  EJECUTANDO --apply');
    console.log('═══════════════════════════════════════════════════════════════');
    await applyToFirestore({ items, stock, repSet });
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
