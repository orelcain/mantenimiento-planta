/**
 * clean-repuestos-nombres — repara datos sucios de TEXTO en el maestro `repuestos`.
 *
 * Dos reparaciones automáticas (auditoría 2026-07-17: 105 + 79 docs):
 *  1. MOJIBAKE (doble encoding UTF-8): "elÃ¡stico"→"elástico", "SEÃALETICA"→
 *     "SEÑALETICA", "NÂ°14"→"N°14". Roundtrip latin1→utf8 iterado (máx 3);
 *     si aparece U+FFFD (pérdida) se corta y el doc va al reporte MANUAL sin tocar.
 *  2. COMILLAS CSV escapadas: '"LLAVE STILLSON 6"" ACERO"'→'LLAVE STILLSON 6" ACERO'
 *     (des-envolver comillas exteriores cuando hay "" adentro + "" → ").
 *
 * Solo REPORTA (no toca): docs sin textoBreve ni descripcion, y "(NO USAR)" —
 * qué hacer con ellos es decisión de negocio (¿papelera?), no de encoding.
 *
 * Campos tratados: textoBreve, descripcion, alias, observaciones, marca, modeloTipo.
 * Tras aplicar, re-correr scripts/backfill-bodega-texto-breve.js --write para
 * sincronizar el nombre denormalizado en `bodega`.
 *
 *   node scripts/clean-repuestos-nombres.js            ← DRY-RUN (no escribe)
 *   node scripts/clean-repuestos-nombres.js --write    ← aplica
 *
 * Credenciales: serviceAccountKey.json en la raíz, o env SERVICE_ACCOUNT.
 */
const admin = require('firebase-admin');
const path = require('path');
const keyPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

const CAMPOS = ['textoBreve', 'descripcion', 'alias', 'observaciones', 'marca', 'modeloTipo'];
const ARTEFACTO = /[ÃÂ]/;

// Mojibake que el roundtrip no puede reconstruir (bytes ya perdidos) pero cuyo
// nombre correcto es obvio a ojo — corregidos a mano (auditoría 2026-07-17).
const MANUAL_FIXES = {
  '3100027824': { textoBreve: 'TONER LÁSER JET PRO400 NEGRO HP 305A' },
  '3100029044': { textoBreve: 'SEÑALETICAS IDENTIFICACIÓN JAULAS' },
  '3300104746': { textoBreve: 'SOLDADURA P/CAÑERIAS 50% ESTAÑO' },
};

/** Roundtrip latin1→utf8 iterado. Devuelve null si no logra limpiar sin pérdida. */
function repararMojibake(s) {
  let cur = s;
  for (let i = 0; i < 3 && ARTEFACTO.test(cur); i++) {
    const next = Buffer.from(cur, 'latin1').toString('utf8');
    if (next.includes('�')) break; // pérdida: no seguir por este camino
    cur = next;
  }
  // NBSP y dobles espacios que deja el encoding
  cur = cur.replace(/ /g, ' ').replace(/ {2,}/g, ' ').trim();
  return ARTEFACTO.test(cur) ? null : cur;
}

function repararComillas(s) {
  let out = s;
  if (/^".*"$/.test(out) && out.slice(1, -1).includes('""')) out = out.slice(1, -1);
  return out.replace(/""/g, '"');
}

(async () => {
  console.log('Cargando repuestos…');
  const snap = await db.collection('repuestos').get();

  const updates = []; // { id, cambios: {campo: nuevo}, antes: {campo: viejo} }
  const manuales = []; // mojibake irreparable — revisar a mano
  const sinNombre = [];
  const noUsar = [];

  snap.docs.forEach((d) => {
    const x = d.data();
    const nombre = x.textoBreve || '';
    if (!nombre && !x.descripcion) sinNombre.push(d.id);
    if (/\(NO USAR\)/i.test(nombre)) noUsar.push(d.id);

    const cambios = {};
    const antes = {};
    for (const campo of CAMPOS) {
      const v = x[campo];
      if (typeof v !== 'string' || !v) continue;
      let nuevo = v;
      const manual = MANUAL_FIXES[d.id]?.[campo];
      if (manual && manual !== v) {
        cambios[campo] = manual;
        antes[campo] = v;
        continue;
      }
      if (ARTEFACTO.test(nuevo)) {
        const rep = repararMojibake(nuevo);
        if (rep === null) { manuales.push({ id: d.id, campo, valor: v }); continue; }
        nuevo = rep;
      }
      if (nuevo.includes('""') || (/^".*"$/.test(nuevo) && nuevo.slice(1, -1).includes('""'))) {
        nuevo = repararComillas(nuevo);
      }
      if (nuevo !== v) { cambios[campo] = nuevo; antes[campo] = v; }
    }
    if (Object.keys(cambios).length) updates.push({ id: d.id, cambios, antes });
  });

  console.log(`\nRepuestos totales: ${snap.size}`);
  console.log(`A reparar (mojibake/comillas): ${updates.length}`);
  console.log(`Mojibake irreparable (MANUAL, no se toca): ${manuales.length}`);
  console.log(`Solo reporte — sin nombre ni descripción: ${sinNombre.length} (${sinNombre.join(', ')})`);
  console.log(`Solo reporte — "(NO USAR)": ${noUsar.length}`);

  console.log('\nMuestra de reparaciones (20):');
  updates.slice(0, 20).forEach((u) => {
    for (const campo of Object.keys(u.cambios)) {
      console.log(`  ${u.id} [${campo}]\n    "${u.antes[campo]}"\n  → "${u.cambios[campo]}"`);
    }
  });
  if (manuales.length) {
    console.log('\nIrreparables (revisar a mano):');
    manuales.forEach((m) => console.log(`  ${m.id} [${m.campo}]: ${m.valor}`));
  }

  if (!WRITE) {
    console.log('\nDRY-RUN (no se escribió nada). Repite con --write para aplicar.');
    process.exit(0);
  }

  console.log(`\nEscribiendo ${updates.length} repuestos…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + 400);
    for (const u of chunk) batch.update(db.collection('repuestos').doc(u.id), u.cambios);
    await batch.commit();
    done += chunk.length;
    console.log(`  ${done}/${updates.length}`);
  }
  console.log('\nListo. Recorda re-correr backfill-bodega-texto-breve.js --write para sincronizar bodega.');
  process.exit(0);
})();
