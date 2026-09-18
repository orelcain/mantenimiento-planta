/**
 * backfill-miniaturas-bitacora — genera la miniatura de 320 px de las fotos de
 * la bitácora subidas ANTES del 18-09-2026, que no la tienen.
 *
 * Por qué: la lista pintaba cuadraditos de 48 px bajando la foto ENTERA. Un
 * turno de 13 fotos = 3,4 MB por 4G en planta (medido), y en iPhone las
 * miniaturas salían con el ícono roto aunque el visor abriera la foto sin
 * problema. Desde el 18-09-2026 cada foto nueva sube además su `t_<id>.jpg`
 * (apps/pwa/src/services/bitacora/fotosBitacora.ts, misma convención de nombre
 * que `miniaturaDe()`); este script hace lo mismo con las viejas.
 *
 * Necesita `sharp`, que NO es dependencia del repo (se usa una vez):
 *   npm i --no-save sharp
 *
 * Idempotente: salta la foto que ya tiene `thumbUrl`. No toca la foto original.
 *
 *   node scripts/backfill-miniaturas-bitacora.js            ← DRY-RUN (no escribe)
 *   node scripts/backfill-miniaturas-bitacora.js --write    ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
});
const db = admin.firestore();
const bucket = admin.storage().bucket();
const WRITE = process.argv.includes('--write');

const ANCHO = 320;
const CALIDAD = 70;

/** `bitacora/T/E/abc.jpg` → `bitacora/T/E/t_abc.jpg` (igual que fotosBitacora.ts). */
function miniaturaDe(p) {
  const corte = p.lastIndexOf('/');
  return `${p.slice(0, corte + 1)}t_${p.slice(corte + 1)}`;
}

async function main() {
  const sharp = WRITE ? require('sharp') : null;
  const snap = await db.collection('bitacoraEventos').get();
  let fotos = 0, conThumb = 0, sinPath = 0, hechas = 0, fallidas = 0;
  let bytesOriginal = 0, bytesMini = 0;

  for (const doc of snap.docs) {
    const lista = doc.data().fotos;
    if (!Array.isArray(lista) || lista.length === 0) continue;
    const nuevas = [];
    let cambio = false;

    for (const f of lista) {
      fotos++;
      if (!f || typeof f.path !== 'string' || !f.path) {
        sinPath++;
        nuevas.push(f);
        continue;
      }
      if (f.thumbUrl) {
        conThumb++;
        nuevas.push(f);
        continue;
      }
      const destino = miniaturaDe(f.path);
      if (!WRITE) {
        const [meta] = await bucket.file(f.path).getMetadata().catch(() => [null]);
        if (meta) bytesOriginal += Number(meta.size) || 0;
        hechas++;
        nuevas.push(f);
        continue;
      }
      try {
        const [buf] = await bucket.file(f.path).download();
        bytesOriginal += buf.length;
        const mini = await sharp(buf).rotate().resize({ width: ANCHO, withoutEnlargement: true }).jpeg({ quality: CALIDAD }).toBuffer();
        bytesMini += mini.length;
        // Token de descarga: sin él, `getDownloadURL` del cliente no sirve y la
        // URL pública tampoco existe (el bucket no es público).
        const token = require('crypto').randomUUID();
        await bucket.file(destino).save(mini, {
          contentType: 'image/jpeg',
          metadata: { metadata: { firebaseStorageDownloadTokens: token } },
        });
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destino)}?alt=media&token=${token}`;
        nuevas.push({ ...f, thumbUrl: url, thumbPath: destino });
        cambio = true;
        hechas++;
      } catch (e) {
        fallidas++;
        console.error(`  ✗ ${f.path}: ${e.message}`);
        nuevas.push(f);
      }
    }

    // De a UN documento: una escritura masiva en lote deja a medias un turno
    // entero si falla, y acá cada doc es el turno de alguien.
    if (cambio && WRITE) {
      await doc.ref.update({ fotos: nuevas });
      console.log(`  ✓ ${doc.id} (${nuevas.filter((f) => f.thumbUrl).length}/${nuevas.length} con miniatura)`);
    }
  }

  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`\nEventos con fotos: ${snap.docs.filter((d) => (d.data().fotos ?? []).length).length}`);
  console.log(`Fotos: ${fotos} · ya tenían miniatura: ${conThumb} · sin path: ${sinPath}`);
  console.log(`${WRITE ? 'Miniaturas creadas' : 'Faltan (dry-run)'}: ${hechas}${fallidas ? ` · fallidas: ${fallidas}` : ''}`);
  console.log(`Peso original: ${kb(bytesOriginal)}${WRITE ? ` → miniaturas: ${kb(bytesMini)}` : ''}`);
  if (!WRITE) console.log('\nDRY-RUN: no se escribió nada. Repetir con --write (antes: npm i --no-save sharp).');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
