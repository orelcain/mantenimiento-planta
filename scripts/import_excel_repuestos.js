#!/usr/bin/env node
/**
 * Importa repuestos desde un Excel y los carga en machines/baader-200/repuestos.
 * Usa las columnas: codigoSAP, codigoBaader, textoBreve, descripcion, cantidad, valorUnitario
 * (también reconoce variantes como "codigo sap", "sap", "codigo", "baader", "nombre", "detalle", "stock", "qty", "precio", "costo").
 */

const admin = require('firebase-admin');
const path = require('path');
const XLSX = require('xlsx');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const MACHINE_ID = 'baader-200';
const FILE_NAME = 'baader_200_catalogo_de_repuestos_202_202_excel_solicitud (1).xlsx';
const FILE_PATH = path.join(__dirname, '..', FILE_NAME);

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');
}

function slugify(value, fallback = 'item') {
  const s = normalizeString(value) || fallback;
  return s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || fallback;
}

function mapRow(row) {
  const lower = {};
  Object.entries(row).forEach(([k, v]) => {
    lower[k.toLowerCase()] = v;
  });

  const codigoSAP = normalizeString(
    lower['codigosap'] || lower['codigo sap'] || lower['sap'] || lower['codigo'] || lower['sapcode']
  );
  const codigoBaader = normalizeString(
    lower['codigobaader'] || lower['codigo baader'] || lower['baader'] || lower['baadercode']
  );
  const textoBreve = normalizeString(
    lower['textobreve'] || lower['texto breve'] || lower['nombre'] || lower['descripcion corta'] || lower['detalle']
  );
  const descripcion = normalizeString(
    lower['descripcion'] || lower['descripción'] || lower['detalle'] || lower['texto'] || textoBreve
  );
  const cantidad = normalizeNumber(lower['cantidad'] || lower['stock'] || lower['qty'] || lower['cantidadsolicitada'], 0);
  const valorUnitario = normalizeNumber(
    lower['valorunitario'] || lower['valor unitario'] || lower['precio'] || lower['costo'] || lower['pu'],
    0
  );

  return { codigoSAP, codigoBaader, textoBreve, descripcion, cantidad, valorUnitario };
}

async function loadExcel() {
  const wb = XLSX.readFile(FILE_PATH);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('El Excel no tiene hojas');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('La hoja seleccionada está vacía');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(mapRow).filter((r) => r.codigoSAP || r.codigoBaader || r.textoBreve || r.descripcion);
}

async function importRows(rows) {
  const collectionPath = `machines/${MACHINE_ID}/repuestos`;
  const existingSnap = await db.collection(collectionPath).get();
  const bySAP = new Map();
  const byBaader = new Map();
  const byText = new Map();

  const normalizeText = (text) => normalizeString(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  existingSnap.forEach((doc) => {
    const data = doc.data();
    if (data.codigoSAP) bySAP.set(normalizeKey(data.codigoSAP), { id: doc.id, data });
    if (data.codigoBaader) byBaader.set(normalizeKey(data.codigoBaader), { id: doc.id, data });
    const textKey = normalizeText(data.descripcion || data.textoBreve || '');
    if (textKey.length > 5) byText.set(textKey, { id: doc.id, data });
  });

  let created = 0;
  let updated = 0;

  // Firestore batch limit 500; usamos chunks de 400
  const chunkSize = 400;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const row of slice) {
      const keySAP = normalizeKey(row.codigoSAP);
      const keyBaader = normalizeKey(row.codigoBaader);
      const textKey = normalizeString(row.descripcion || row.textoBreve || '');
      const textNorm = textKey ? textKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim() : '';

      const existing = (keySAP && bySAP.get(keySAP)) || (keyBaader && byBaader.get(keyBaader)) || (textNorm && byText.get(textNorm)) || null;
      const tagStock = {
        nombre: 'stock',
        tipo: 'stock',
        cantidad: row.cantidad,
        fecha: new Date(),
      };

      if (existing) {
        const ref = db.doc(`${collectionPath}/${existing.id}`);
        const data = existing.data;
        const tags = Array.isArray(data.tags) ? [...data.tags] : [];
        const idx = tags.findIndex((t) => t && t.nombre === 'stock' && t.tipo === 'stock');
        if (idx >= 0) {
          tags[idx] = { ...tags[idx], cantidad: row.cantidad, fecha: new Date() };
        } else {
          tags.push(tagStock);
        }

        batch.update(ref, {
          codigoSAP: row.codigoSAP || data.codigoSAP || '',
          codigoBaader: row.codigoBaader || data.codigoBaader || '',
          textoBreve: row.textoBreve || data.textoBreve || '',
          descripcion: row.descripcion || data.descripcion || '',
          valorUnitario: row.valorUnitario || data.valorUnitario || 0,
          tags,
          updatedAt: admin.firestore.Timestamp.now(),
        });
        updated++;
      } else {
        const docId = keySAP || keyBaader || slugify(row.textoBreve || row.descripcion || 'repuesto');
        const ref = db.doc(`${collectionPath}/${docId}`);
        batch.set(ref, {
          codigoSAP: row.codigoSAP || '',
          codigoBaader: row.codigoBaader || '',
          textoBreve: row.textoBreve || row.descripcion || '',
          descripcion: row.descripcion || row.textoBreve || '',
          cantidadSolicitada: 0,
          cantidadStockBodega: 0,
          valorUnitario: row.valorUnitario || 0,
          total: (row.valorUnitario || 0) * (row.cantidad || 0),
          tags: [tagStock],
          vinculosManual: [],
          imagenesManual: [],
          fotosReales: [],
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        created++;
      }
    }

    await batch.commit();
  }

  return { created, updated };
}

async function main() {
  try {
    console.log(`📥 Leyendo Excel: ${FILE_PATH}`);
    const rows = await loadExcel();
    console.log(`📄 Filas válidas: ${rows.length}`);

    const result = await importRows(rows);
    console.log(`✅ Importación completada. Creados: ${result.created}, Actualizados: ${result.updated}`);
  } catch (err) {
    console.error('❌ Error en importación:', err.message);
    process.exit(1);
  }
}

main();
