#!/usr/bin/env node
/**
 * Anota en cada captura de manual (imagenesManual[].equipos) los equipos del manual del que
 * salió, para que la app muestre en cada máquina SU dibujo (pieza estándar usada en la 142 y
 * en la 200 → un dibujo de cada manual). Solo AGREGA el campo; no borra ni mueve imágenes.
 *   node scripts/marcar-equipos-imagenes-manual.cjs            (prueba: solo cuenta)
 *   node scripts/marcar-equipos-imagenes-manual.cjs --aplicar  (respaldo + escritura)
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require('../serviceAccountKey.json')) });
const db = admin.firestore();
const APLICAR = process.argv.includes('--aplicar');

// prefijo de la descripción → documento de `manuales` con la lista de equipos
const REGLAS = [
  [/^Referencia despiece Baader 142\b/, 'baader-142__0'],
  [/^Referencia despiece Baader 200\b/, 'baader-200__0'],
  [/Knuro/i, 'knuro__0'],
];

(async () => {
  const equiposDe = {};
  for (const [, m] of REGLAS) equiposDe[m] = (await db.doc(`manuales/${m}`).get()).get('equipos') || [];
  const s = await db.collection('repuestos').get();
  const cuenta = {}; const sinRegla = {}; const cambios = []; const respaldo = {};
  s.forEach((d) => {
    const imgs = d.get('imagenesManual') || [];
    let cambia = false;
    const nuevas = imgs.map((i) => {
      const regla = REGLAS.find(([re]) => re.test(i.descripcion || ''));
      if (!regla) { const k = String(i.descripcion || '(sin descripción)').slice(0, 40); sinRegla[k] = (sinRegla[k] || 0) + 1; return i; }
      const eq = equiposDe[regla[1]];
      cuenta[regla[1]] = (cuenta[regla[1]] || 0) + 1;
      if (JSON.stringify(i.equipos || []) === JSON.stringify(eq)) return i;
      cambia = true;
      return { ...i, equipos: eq };
    });
    if (cambia) { cambios.push([d.ref, nuevas]); respaldo[d.id] = imgs; }
  });
  console.log('capturas por manual:', cuenta);
  console.log('equipos por manual:', Object.fromEntries(Object.entries(equiposDe).map(([k, v]) => [k, v.length])));
  console.log('sin regla (no se tocan):', sinRegla);
  console.log('documentos a actualizar:', cambios.length);
  if (!APLICAR) { console.log('(prueba: no se escribió nada; usar --aplicar)'); process.exit(0); }
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `imagenesManual-antes-equipos-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(respaldo));
  console.log('respaldo:', f);
  for (let k = 0; k < cambios.length; k += 400) {
    const b = db.batch();
    for (const [ref, imgs] of cambios.slice(k, k + 400)) b.update(ref, { imagenesManual: imgs });
    await b.commit();
  }
  console.log('actualizados:', cambios.length);
  process.exit(0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
