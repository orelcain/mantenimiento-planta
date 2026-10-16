/**
 * Reemplaza en cada repuesto GEA la captura del catálogo de la 5550 (serie 50540108, NO es la máquina de
 * planta) por la del catálogo mecánico de la 50520 (serie 50520184) generada con generar-recortes-gea-50520.py.
 *   node scripts/fotos-repuestos/aplicar-recortes-gea-50520.cjs <carpeta con manifest.json> [--dry-run]
 * - Sube el recorte nuevo y lo deja como imagen principal (equipos = los del manual gea__mech-50520).
 * - Desvincula las imágenes «Referencia GEA PowerPak 5550 …» y los vínculos al PDF de la 5550.
 *   Los JPG viejos quedan en Storage (no se borran): se pueden recuperar si algo sale mal.
 * Idempotente: si el repuesto ya tiene la captura nueva, no la vuelve a subir.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const DRY = process.argv.includes('--dry-run');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'serviceAccountKey.json'), 'utf-8'));
const bucketName = `${cfg.project_id}.firebasestorage.app`;
admin.initializeApp({ credential: admin.credential.cert(cfg), storageBucket: bucketName });
const db = admin.firestore();

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
  const m50520 = (await db.doc('manuales/gea__mech-50520').get()).data();
  const m5550 = (await db.doc('manuales/gea__mech-5550').get()).data();
  if (!m50520?.url || !m5550?.url) throw new Error('faltan los manuales gea__mech-50520 / gea__mech-5550');
  const equipos = m50520.equipos || [];
  let n = 0;
  for (const e of man) {
    const ref = db.doc(`repuestos/${e.docId}`);
    const r = (await ref.get()).data();
    if (!r) { console.log('NO EXISTE', e.docId); continue; }
    const imgs = r.imagenesManual || [];
    const viejas = imgs.filter((i) => /PowerPak 5550/.test(i.descripcion || ''));
    const resto = imgs.filter((i) => !viejas.includes(i));
    const vins = (r.vinculosManual || []).filter((v) => v.manualUrl !== m5550.url);
    let nueva = resto.find((i) => i.descripcion === e.descripcion);
    if (!nueva) {
      const dest = `repuestos/${(r.equipos && r.equipos[0]) || 'sin-equipo'}/${e.docId}/manual/${crypto.randomUUID()}.jpg`;
      const token = crypto.randomUUID();
      if (!DRY) await admin.storage().bucket().upload(path.join(dir, e.file), { destination: dest, metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } } });
      nueva = {
        id: crypto.randomUUID(), url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`,
        descripcion: e.descripcion, tipo: 'manual', createdAt: admin.firestore.Timestamp.now(), formatFinal: 'jpeg', ...(equipos.length ? { equipos } : {}),
      };
    }
    // La captura de la 50520 primero (principal); después lo demás que ya tenía (fotos de bodega, otras capturas).
    const imagenesManual = [nueva, ...resto.filter((i) => i !== nueva)].map((i, k) => ({ ...i, orden: k, esPrincipal: k === 0 }));
    const vinculosManual = vins.some((v) => v.manualUrl === m50520.url && v.pagina === e.pagina)
      ? vins
      : [...vins, { id: `vinc_${Date.now()}_${e.pagina}`, pagina: e.pagina, machineId: 'gea', manualUrl: m50520.url, puntos: e.puntos, forma: 'poligono',
        color: 'rgba(239, 68, 68, 0.3)', descripcion: `${e.code} — ${e.nombre}`, sinBorde: false }];
    if (DRY) { console.log(`[DRY] ${e.docId} p${e.pagina}: -${viejas.length} img 5550, -${(r.vinculosManual || []).length - vins.length} vínculo 5550, +1 50520`); continue; }
    await ref.update({ imagenesManual, vinculosManual, updatedAt: admin.firestore.Timestamp.now() });
    n++;
  }
  console.log(DRY ? 'dry-run listo' : `actualizados ${n}`);
  process.exit(0);
})().catch((err) => { console.error('ERROR', err.message); process.exit(1); });
