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
 * Requisitos:
 *   - serviceAccountKey.json en la raíz del repo (o GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Uso:
 *   node scripts/seed-sumitomo-motors.js --dry-run   # previsualizar sin escribir
 *   node scripts/seed-sumitomo-motors.js             # insertar (skip si ya existe)
 *   node scripts/seed-sumitomo-motors.js --force     # insertar/actualizar campos
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

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
  imagenes: [],
  marcadores: []
};

// equipo = nombre de la cinta que acciona | modeloTipo = código proveedor Sumitomo | codigoSAP = SAP interno
const MOTORS = [
  { equipo: 'Cinta desperdicio Baader 200', modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta desperdicio filete',     modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta filete',                 modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta Z elevadora HG',         modeloTipo: 'RNYM1-1320A-30',   codigoSAP: '3300124072' },
  { equipo: 'Cinta alimentación Baader 142', modeloTipo: 'RNYM1-1320A-7',   codigoSAP: '3300124071' },
  { equipo: 'Cinta transversal Baader 142', modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta curva',                  modeloTipo: 'RNYM08-1320B-30',  codigoSAP: '3300124073' },
  { equipo: 'Cinta alimentación Gea',       modeloTipo: 'RNYMS05-1320C-30', codigoSAP: '3300124070' }
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
  descripcionSAP: `MOTOR SUMITOMO ${m.modeloTipo} - ${m.equipo}`,
  observaciones: `Motor Sumitomo nuevo (reemplaza motor SEW anterior). 1 unidad en planta principal. SAP ${m.codigoSAP}, modelo proveedor ${m.modeloTipo}, eje 30mm.`
});

// ── Init Firebase Admin ──
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(serviceAccountPath)) {
    config = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    console.log('✅ serviceAccountKey.json encontrada');
  } else {
    console.log('⚠️  serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS');
  }
  if (!admin.apps.length) {
    admin.initializeApp(config ? { credential: admin.credential.cert(config) } : undefined);
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('⚙️  SEED — 8 motores SUMITOMO (plantAssets · PLANTA CHONCHI)');
  console.log('='.repeat(60) + '\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of MOTORS) {
    const asset = buildAsset(m);
    const ref = db.collection('plantAssets').doc(asset.id);

    if (isDryRun) {
      console.log(`  ✓ [DRY-RUN] ${asset.id}  ·  ${asset.marca} ${asset.modeloTipo}  ·  SAP ${asset.codigoSAP}`);
      created++;
      continue;
    }

    const snap = await ref.get();
    if (snap.exists && !isForce) {
      console.log(`  ℹ️  Existente (skip): ${asset.equipo}`);
      skipped++;
      continue;
    }

    const now = admin.firestore.Timestamp.now();
    if (snap.exists) {
      // --force: actualiza campos de datos, conserva createdAt
      const { id, ...data } = asset;
      await ref.set({ ...data, updatedAt: now }, { merge: true });
      console.log(`  ♻️  Actualizado: ${asset.equipo}`);
      updated++;
    } else {
      const { id, ...data } = asset;
      await ref.set({ ...data, createdAt: now, updatedAt: now });
      console.log(`  ✅ Creado: ${asset.equipo}`);
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
