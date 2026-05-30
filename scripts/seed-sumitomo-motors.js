#!/usr/bin/env node
/**
 * Seed: 8 motores SUMITOMO nuevos (PLANTA CHONCHI) en la colección `plantAssets`.
 *
 * Estos motores reemplazan a los SEW anteriores en la planta principal de proceso.
 * Cada documento = 1 unidad física (el tipo PlantAsset no tiene campo de cantidad;
 * la "cantidad 1 por planta" se refleja como 1 documento por motor).
 *
 * Esquema respetado: PlantAsset (apps/pwa/src/types/repuestos.ts) — leído por
 * usePlantAssets() y mostrado en la tabla Motores/Bombas de Repuestos.
 *
 * Idempotente: usa un docId determinístico por equipo (asset-sumitomo-<slug>),
 * por lo que re-correrlo NO duplica. Si el doc ya existe lo deja como está
 * (a menos que pases --force, que sobrescribe los campos de datos).
 *
 * FOTOS (opcional): si existe una carpeta scripts/sumitomo-photos/ con un archivo
 * nombrado por código SAP (ej. 3300124073.jpg), el script lo sube a Firebase
 * Storage en plantAssets/<assetId>/ y lo deja como imagen principal del asset.
 * Los 5 motores que comparten el SAP 3300124073 reciben todos esa misma foto.
 * Formatos aceptados: .jpg .jpeg .png .webp
 *
 * Requisitos:
 *   - serviceAccountKey.json en la raíz del repo (o GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Uso:
 *   node scripts/seed-sumitomo-motors.js --dry-run   # previsualizar sin escribir
 *   node scripts/seed-sumitomo-motors.js             # insertar (skip si ya existe)
 *   node scripts/seed-sumitomo-motors.js --force     # insertar/actualizar + re-subir fotos
 *   node scripts/seed-sumitomo-motors.js --no-photos # crear sin tocar imágenes
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const noPhotos = args.includes('--no-photos');

const PHOTOS_DIR = path.join(__dirname, 'sumitomo-photos');
const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const CONTENT_TYPE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Bucket de Storage (CLAUDE.md: NO es .appspot.com). Override con STORAGE_BUCKET.
const DEFAULT_BUCKET = 'mantenimiento-planta-771a3.firebasestorage.app';

// ── Descripción SAP real (leída de las etiquetas físicas) por código SAP ──
const SAP_DESC = {
  '3300124070': 'MOTOR REDUCTOR MOD RNYM05 207 RPM',
  '3300124071': 'MOTOR REDUCTOR MOD RNYM1 207RPM',
  '3300124072': 'MOTOR REDUCTOR MOD RNYM1 48.3 RPM',
  '3300124073': 'MOTOR REDUCTOR MOD RNYM08 48,3 RPM'
};

// ── Datos comunes a los 8 motores ──
const COMMON = {
  tipo: 'motor',
  area: 'PLANTA CHONCHI', // planta principal de proceso (valor canónico de la jerarquía)
  subarea: '',
  componente: '',
  marca: 'Sumitomo',
  potencia: '',
  voltaje: '',
  corriente: '',
  eje: '30mm',
  relacionReduccion: '',
  referencias: [],
  marcadores: []
};

// equipo = nombre de la cinta que acciona | modeloTipo = código proveedor Sumitomo | codigoSAP = SAP interno
const MOTORS = [
  { equipo: 'Cinta desperdicio Baader 200',  modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta desperdicio filete',      modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta filete',                  modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta Z elevadora HG',          modeloTipo: 'RNYM1-1320A-30',   codigoSAP: '3300124072' },
  { equipo: 'Cinta alimentación Baader 142', modeloTipo: 'RNYM1-1320A-7',    codigoSAP: '3300124071' },
  { equipo: 'Cinta transversal Baader 142',  modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta curva',                   modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta alimentación Gea',        modeloTipo: 'RNYMS05-1320C-30', codigoSAP: '3300124070' }
];

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildAsset = (m) => ({
  id: `asset-sumitomo-${slugify(m.equipo)}`,
  ...COMMON,
  equipo: m.equipo,
  modeloTipo: m.modeloTipo,
  codigoSAP: m.codigoSAP,
  descripcionSAP: SAP_DESC[m.codigoSAP] || `MOTOR SUMITOMO ${m.modeloTipo}`,
  observaciones: `Motor Sumitomo nuevo (reemplaza motor SEW anterior). 1 unidad en planta principal. SAP ${m.codigoSAP}, modelo proveedor ${m.modeloTipo}, eje 30mm.`
});

/** Busca el archivo de foto para un código SAP en scripts/sumitomo-photos/ */
const findPhotoFile = (codigoSAP) => {
  for (const ext of PHOTO_EXTS) {
    const p = path.join(PHOTOS_DIR, `${codigoSAP}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// ── Init Firebase Admin ──
let bucketName = process.env.STORAGE_BUCKET || DEFAULT_BUCKET;
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(serviceAccountPath)) {
    config = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    if (config.project_id && !process.env.STORAGE_BUCKET) bucketName = `${config.project_id}.firebasestorage.app`;
    console.log('✅ serviceAccountKey.json encontrada');
  } else {
    console.log('⚠️  serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS');
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      ...(config ? { credential: admin.credential.cert(config) } : {}),
      storageBucket: bucketName
    });
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

/**
 * Sube la foto a Storage y devuelve un PlantAssetImagen con URL tokenizada
 * (mismo formato que getDownloadURL del SDK web, para que la app la renderice).
 */
async function uploadPhoto(assetId, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = `foto-sap${path.basename(filePath)}`;
  const dest = `plantAssets/${assetId}/${fileName}`;
  const token = crypto.randomUUID();

  await admin.storage().bucket().upload(filePath, {
    destination: dest,
    metadata: {
      contentType: CONTENT_TYPE[ext] || 'application/octet-stream',
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
  return {
    id: crypto.randomUUID(),
    url,
    descripcion: 'Foto del motor (etiqueta SAP)',
    orden: 0,
    esPrincipal: true,
    createdAt: admin.firestore.Timestamp.now()
  };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('⚙️  SEED — 8 motores SUMITOMO (plantAssets · PLANTA CHONCHI)');
  console.log('='.repeat(60));
  console.log(`Bucket Storage: ${bucketName}`);
  const photosAvailable = !noPhotos && fs.existsSync(PHOTOS_DIR);
  console.log(`Fotos: ${noPhotos ? 'desactivadas (--no-photos)' : photosAvailable ? `carpeta ${PHOTOS_DIR}` : 'carpeta scripts/sumitomo-photos/ no encontrada → se crean sin imagen'}\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of MOTORS) {
    const asset = buildAsset(m);
    const ref = db.collection('plantAssets').doc(asset.id);
    const photoPath = photosAvailable ? findPhotoFile(m.codigoSAP) : null;
    const photoTag = photoPath ? `📷 ${path.basename(photoPath)}` : '(sin foto)';

    if (isDryRun) {
      console.log(`  ✓ [DRY-RUN] ${asset.id}`);
      console.log(`      ${asset.marca} ${asset.modeloTipo} · SAP ${asset.codigoSAP} · "${asset.descripcionSAP}" · ${photoTag}`);
      created++;
      continue;
    }

    const snap = await ref.get();
    if (snap.exists && !isForce) {
      console.log(`  ℹ️  Existente (skip): ${asset.equipo}`);
      skipped++;
      continue;
    }

    // Subir foto si hay archivo disponible
    let imagenes = [];
    if (photoPath) {
      try {
        imagenes = [await uploadPhoto(asset.id, photoPath)];
      } catch (e) {
        console.log(`     ⚠️  No se pudo subir la foto (${path.basename(photoPath)}): ${e.message}`);
      }
    }

    const now = admin.firestore.Timestamp.now();
    const { id, ...data } = asset;
    if (snap.exists) {
      // --force: actualiza campos; solo pisa imágenes si subimos una nueva
      const patch = { ...data, updatedAt: now };
      if (imagenes.length) patch.imagenes = imagenes;
      await ref.set(patch, { merge: true });
      console.log(`  ♻️  Actualizado: ${asset.equipo} ${imagenes.length ? '· 📷 foto' : ''}`);
      updated++;
    } else {
      await ref.set({ ...data, imagenes, createdAt: now, updatedAt: now });
      console.log(`  ✅ Creado: ${asset.equipo} ${imagenes.length ? '· 📷 foto' : '(sin foto)'}`);
      created++;
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Resumen: ${created} creados · ${updated} actualizados · ${skipped} saltados (de ${MOTORS.length})`);
  if (isDryRun) console.log('⚠️  MODO DRY-RUN: no se escribió en Firestore. Corre sin --dry-run para aplicar.');
  console.log('-'.repeat(60) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
