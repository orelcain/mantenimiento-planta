#!/usr/bin/env node
/**
 * Seed: equipos del LEVANTAMIENTO (docx) → colección `plantAssets`.
 *
 * Lee un JSON de área (ej. scripts/levantamiento-import/equipos_eviscerado_hg.json)
 * y crea 1 PlantAsset por motor/bomba (mapeo plano). Las specs de estructura/cinta
 * y la frecuencia de mantención se vuelcan a `observaciones`. Sube las fotos
 * referenciadas (carpeta scripts/levantamiento-import/media/) a Storage.
 *
 * Idempotente: docId determinístico `asset-lev-<slug>`. Re-correr NO duplica.
 *
 * Uso:
 *   node scripts/seed-levantamiento.js --file scripts/levantamiento-import/equipos_eviscerado_hg.json --dry-run
 *   node scripts/seed-levantamiento.js --file ...            # insertar (skip si existe)
 *   node scripts/seed-levantamiento.js --file ... --force    # actualiza + re-sube fotos
 *   node scripts/seed-levantamiento.js --file ... --no-photos
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const noPhotos = args.includes('--no-photos');
const fileArg = getArg('--file');

if (!fileArg) { console.error('❌ Falta --file <ruta JSON>'); process.exit(1); }
const JSON_PATH = path.resolve(fileArg);
const MEDIA_DIR = path.join(path.dirname(JSON_PATH), 'media');
const CONTENT_TYPE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const DEFAULT_BUCKET = 'mantenimiento-planta-771a3.firebasestorage.app';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── Init Firebase Admin ──
let bucketName = process.env.STORAGE_BUCKET || DEFAULT_BUCKET;
try {
  const saPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(saPath)) {
    config = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
    if (config.project_id && !process.env.STORAGE_BUCKET) bucketName = `${config.project_id}.firebasestorage.app`;
    console.log('✅ serviceAccountKey.json encontrada');
  } else { console.log('⚠️  serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS'); }
  if (!admin.apps.length) {
    admin.initializeApp({ ...(config ? { credential: admin.credential.cert(config) } : {}), storageBucket: bucketName });
  }
} catch (err) { console.error('❌ Error inicializando Firebase:', err.message); process.exit(1); }

const db = admin.firestore();

/** Compone el campo observaciones a partir de los extras del JSON. */
function buildObservaciones(e, meta) {
  const parts = [];
  parts.push(`Fuente: levantamiento ${meta.area_doc} (${meta.fuente}).`);
  if (e.flags && e.flags.length) parts.push(`Estado: ${e.flags.join(' · ')}.`);
  if (e._relacion) parts.push(e._relacion);
  if (e.estructura) parts.push(`Estructura: ${e.estructura}.`);
  if (e.cinta && e.cinta !== '(sin datos en doc)') parts.push(`Cinta: ${e.cinta}.`);
  if (e.obs_extra) parts.push(e.obs_extra);
  if (e.mantencion && e.mantencion.length) parts.push(`Mantención — ${e.mantencion.join('; ')}.`);
  return parts.join('\n');
}

function buildAsset(e, meta) {
  return {
    id: `asset-lev-${slugify(e.conjunto)}`,
    tipo: e.tipo === 'bomba' ? 'bomba' : 'motor',
    equipo: e.conjunto,
    area: e.area || meta.app_area,
    subarea: e.subarea || meta.app_subarea || '',
    componente: '',
    codigoSAP: e.codigoSAP || '',
    descripcionSAP: e.descripcionSAP || '',
    marca: e.marca || '',
    modeloTipo: e.modeloTipo || '',
    potencia: e.potencia || '',
    voltaje: e.voltaje || '',
    corriente: e.corriente || '',
    eje: e.eje || '',
    relacionReduccion: '',
    caudalM3h: e.caudalM3h && e.caudalM3h !== '(sin valor en doc)' ? e.caudalM3h : '',
    observaciones: buildObservaciones(e, meta),
    referencias: [],
    marcadores: [],
  };
}

async function uploadPhoto(assetId, fileName, orden) {
  const filePath = path.join(MEDIA_DIR, fileName);
  if (!fs.existsSync(filePath)) { console.log(`     ⚠️  Foto no encontrada: ${fileName}`); return null; }
  const ext = path.extname(fileName).toLowerCase();
  const dest = `plantAssets/${assetId}/imagenes/${fileName}`;
  const token = crypto.randomUUID();
  await admin.storage().bucket().upload(filePath, {
    destination: dest,
    metadata: { contentType: CONTENT_TYPE[ext] || 'application/octet-stream', metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
  return { id: crypto.randomUUID(), url, descripcion: `Foto levantamiento (${fileName})`, orden, esPrincipal: orden === 0, createdAt: admin.firestore.Timestamp.now() };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  const meta = data._meta || {};
  const equipos = data.equipos || [];
  console.log('\n' + '='.repeat(64));
  console.log(`📋 SEED LEVANTAMIENTO — ${meta.area_doc || JSON_PATH}`);
  console.log('='.repeat(64));
  console.log(`Bucket: ${bucketName} | Área app: ${meta.app_area} / ${meta.app_subarea}`);
  console.log(`Fotos: ${noPhotos ? 'desactivadas' : `carpeta ${MEDIA_DIR}`}\n`);

  let created = 0, updated = 0, skipped = 0;
  for (const e of equipos) {
    const asset = buildAsset(e, meta);
    const ref = db.collection('plantAssets').doc(asset.id);
    const fotos = (!noPhotos && Array.isArray(e.fotos)) ? e.fotos : [];
    const fotoTag = fotos.length ? `📷 ${fotos.length}` : '(sin foto)';

    if (isDryRun) {
      console.log(`  ✓ [DRY] ${asset.id}`);
      console.log(`      ${asset.tipo} · ${asset.marca || '(sin marca)'} ${asset.modeloTipo} · ${asset.potencia || ''} · ${fotoTag}`);
      created++; continue;
    }

    const snap = await ref.get();
    if (snap.exists && !isForce) { console.log(`  ℹ️  Existe (skip): ${asset.equipo}`); skipped++; continue; }

    let imagenes = [];
    for (let i = 0; i < fotos.length; i++) {
      try { const img = await uploadPhoto(asset.id, fotos[i], i); if (img) imagenes.push(img); }
      catch (err) { console.log(`     ⚠️  Falló subir ${fotos[i]}: ${err.message}`); }
    }

    const now = admin.firestore.Timestamp.now();
    const { id, ...d } = asset;
    if (snap.exists) {
      const patch = { ...d, updatedAt: now };
      if (imagenes.length) patch.imagenes = imagenes;
      await ref.set(patch, { merge: true });
      console.log(`  ♻️  Actualizado: ${asset.equipo} ${imagenes.length ? '· 📷 ' + imagenes.length : ''}`);
      updated++;
    } else {
      await ref.set({ ...d, imagenes, createdAt: now, updatedAt: now });
      console.log(`  ✅ Creado: ${asset.equipo} ${imagenes.length ? '· 📷 ' + imagenes.length : '(sin foto)'}`);
      created++;
    }
  }
  console.log('\n' + '-'.repeat(64));
  console.log(`Resumen: ${created} creados · ${updated} actualizados · ${skipped} saltados (de ${equipos.length})`);
  if (isDryRun) console.log('⚠️  DRY-RUN: no se escribió nada. Corre sin --dry-run para aplicar.');
  console.log('-'.repeat(64) + '\n');
  process.exit(0);
}

main().catch((err) => { console.error('\n❌ Error fatal:', err.message); process.exit(1); });
