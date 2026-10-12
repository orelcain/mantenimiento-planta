#!/usr/bin/env node
/**
 * Carga imágenes de referencia del manual (imagenesManual, tipo 'manual') + vínculo a la página
 * (vinculosManual, polígono rojo) a repuestos, desde un manifest.json.
 *   node scripts/cargar-referencias-manual.cjs <carpeta-con-manifest> <machineId> [--dry-run]
 * manifest: [{docId, pagina, puntos:[{x,y}], file, descripcion, code, nombre}]
 * No toca fotosReales. Idempotente: salta imágenes con la misma descripcion y vínculos a la misma página.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [dir, machineId] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'serviceAccountKey.json'), 'utf-8'));
const bucketName = `${cfg.project_id}.firebasestorage.app`;
admin.initializeApp({ credential: admin.credential.cert(cfg), storageBucket: bucketName });
const db = admin.firestore();

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
  // URL del manual de la máquina: se toma de un vínculo existente de esa máquina
  let manualUrl = null;
  const all = await db.collection('repuestos').get();
  all.forEach((d) => { for (const v of d.get('vinculosManual') || []) if (!manualUrl && v.machineId === machineId) manualUrl = v.manualUrl; });
  if (!manualUrl) {
    // Máquina sin vínculos todavía: el manual principal está en `manuales/<machineId>__0`.
    const m = await db.doc(`manuales/${machineId}__0`).get();
    if (m.exists) manualUrl = m.get('url') || null;
  }
  if (!manualUrl) { console.log('No encontré manualUrl para', machineId); process.exit(2); }
  // Equipos del manual: van en cada captura para que la app muestre en cada máquina SU dibujo.
  const equiposManual = (await db.doc(`manuales/${machineId}__0`).get()).get('equipos') || [];
  // --parte=k/n: procesa solo esa fracción del manifest (para cargar en paralelo sin pisarse).
  const parte = (process.argv.find((x) => x.startsWith('--parte=')) || '').replace('--parte=', '');
  let lista = man;
  if (parte) { const [k, n] = parte.split('/').map(Number); lista = man.filter((_, i) => i % n === k - 1); }
  for (const e of lista) {
    const ref = db.doc(`repuestos/${e.docId}`);
    const snap = await ref.get();
    if (!snap.exists) { console.log('NO EXISTE', e.docId); continue; }
    const r = snap.data();
    let imgs = r.imagenesManual || [];
    let vins = r.vinculosManual || [];
    const patch = {};
    if (process.argv.includes('--reemplazar')) {
      // quita SOLO lo generado por este script para esa página (piloto previo); no toca vínculos hechos a mano
      const pref = `Referencia manual Knuro KF 3.01 pág. ${e.pagina} -`;
      const iOld = imgs.filter((i) => i.descripcion.startsWith(pref) && i.descripcion !== e.descripcion);
      const vOld = vins.filter((v) => v.machineId === machineId && v.pagina === e.pagina && /^vinc_\d+_\d+$/.test(v.id));
      if (iOld.length || vOld.length) {
        imgs = imgs.filter((i) => !iOld.includes(i)).map((i, k) => ({ ...i, orden: k, esPrincipal: k === 0 }));
        vins = vins.filter((v) => !vOld.includes(v));
        patch.imagenesManual = imgs; patch.vinculosManual = vins;
        console.log(`  reemplaza ${e.docId} p${e.pagina}: -${iOld.length} img, -${vOld.length} vínculo`);
      }
    }
    if (!imgs.some((i) => i.descripcion === e.descripcion)) {
      const dest = `repuestos/${(r.equipos && r.equipos[0]) || 'sin-equipo'}/${e.docId}/manual/${crypto.randomUUID()}.jpg`;
      if (DRY) console.log(`[DRY] ${e.file} -> ${dest}`);
      else {
        const token = crypto.randomUUID();
        await admin.storage().bucket().upload(path.join(dir, e.file), { destination: dest, metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } } });
        const nuevas = imgs;
        patch.imagenesManual = [...nuevas, { id: crypto.randomUUID(), url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`,
          descripcion: e.descripcion, orden: nuevas.length, esPrincipal: nuevas.length === 0, tipo: 'manual', createdAt: admin.firestore.Timestamp.now(), formatFinal: 'jpeg',
          ...(equiposManual.length ? { equipos: equiposManual } : {}) }];
      }
    }
    if (e.posicion && !r.posicionManual) patch.posicionManual = e.posicion;
    if (e.puntos && e.puntos.length && !vins.some((v) => v.machineId === machineId && v.pagina === e.pagina)) {
      patch.vinculosManual = [...vins, { id: `vinc_${Date.now()}_${e.pagina}`, pagina: e.pagina, machineId, manualUrl, puntos: e.puntos, forma: 'poligono',
        color: 'rgba(239, 68, 68, 0.3)', descripcion: `${e.code} — ${e.nombre}`, sinBorde: false }];
    }
    if (DRY) { console.log(`[DRY] ${e.docId} p${e.pagina} -> ${Object.keys(patch).join(',') || 'nada'}`); continue; }
    if (Object.keys(patch).length) await ref.update({ ...patch, updatedAt: admin.firestore.Timestamp.now() });
    const x = (await ref.get()).data();
    const last = (x.imagenesManual || []).slice(-1)[0];
    const h = last ? (await fetch(last.url, { method: 'HEAD' })).status : '-';
    console.log(`${e.docId} p${e.pagina} | ${x.textoBreve || e.nombre} | imgManual ${(x.imagenesManual || []).length} (HTTP ${h}) | vinculos ${(x.vinculosManual || []).length}`);
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR', err.message); process.exit(1); });
