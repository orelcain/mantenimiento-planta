/**
 * backfill-equipment-tipo — pobla el campo `tipo` de los equipos a partir de
 * una palabra clave del `nombre` (Motor, Bomba, Compresor, …).
 *
 * Heurístico y conservador: solo asigna `tipo` a equipos que NO lo tengan
 * (idempotente). El que no matchea ninguna palabra clave queda sin tipo
 * (se puede fijar a mano desde la ficha en el CTD).
 *
 *   node scripts/backfill-equipment-tipo.js            ← DRY-RUN (no escribe)
 *   node scripts/backfill-equipment-tipo.js --write    ← aplica
 *   node scripts/backfill-equipment-tipo.js --force     ← reasigna aunque ya tenga tipo
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

// Normaliza: mayúsculas + sin acentos, para matchear palabras clave.
function norm(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

// Orden importa: lo más específico primero; primer match gana.
const REGLAS = [
  [/MOTO\s*VENTILADOR/, 'Ventilador'],
  [/VENTILADOR/, 'Ventilador'],
  [/EXTRACTOR/, 'Extractor'],
  [/EVISCERADORA/, 'Evisceradora'],
  [/CENTRAL\s*HIDRAULICA/, 'Central hidráulica'],
  [/INTERCAMBIADOR/, 'Intercambiador'],
  [/CONDENSADOR/, 'Condensador'],
  [/EVAPORADOR/, 'Evaporador'],
  [/COMPRESOR/, 'Compresor'],
  [/ENFRIADOR/, 'Enfriador'],
  [/CHILLER/, 'Chiller'],
  [/REDUCTOR/, 'Reductor'],
  [/TABLERO/, 'Tablero'],
  [/\bCINTA\b|TRANSPORTADOR|ELEVADORA/, 'Cinta transportadora'],
  [/TUNEL/, 'Túnel'],
  [/CAMARA/, 'Cámara'],
  [/VALVULA/, 'Válvula'],
  [/AIRE\s*ACONDICIONADO/, 'Aire acondicionado'],
  [/CORTINA\s*(DE\s*)?AIRE/, 'Cortina de aire'],
  [/CAUDALIMETRO/, 'Caudalímetro'],
  [/CALDERA/, 'Caldera'],
  [/BALANZA/, 'Balanza'],
  [/AGITADOR/, 'Agitador'],
  [/ESTANQUE/, 'Estanque'],
  [/TORNILLO/, 'Tornillo'],
  [/CICLON/, 'Ciclón'],
  [/DESAGUADOR/, 'Desaguador'],
  [/ATURDIMIENTO/, 'Aturdidor'],
  [/FILTRO/, 'Filtro'],
  [/\bBOMBA\b/, 'Bomba'],
  [/\bMOTOR\b/, 'Motor'],
];

function tipoDeNombre(nombre) {
  const n = norm(nombre);
  for (const [re, tipo] of REGLAS) {
    if (re.test(n)) return tipo;
  }
  return null;
}

(async () => {
  const snap = await db.collection('equipment').get();
  const dist = {};
  let yaTienen = 0;
  let asignados = 0;
  const sinMatch = [];
  const updates = [];

  snap.forEach((d) => {
    const e = d.data();
    if (e.deleted) return;
    if (!FORCE && e.tipo && String(e.tipo).trim()) {
      yaTienen++;
      return;
    }
    const tipo = tipoDeNombre(e.nombre);
    if (!tipo) {
      if (sinMatch.length < 25) sinMatch.push(e.nombre);
      return;
    }
    dist[tipo] = (dist[tipo] || 0) + 1;
    asignados++;
    updates.push({ id: d.id, tipo });
  });

  console.log(`\nEquipos totales (no eliminados) revisados: ${snap.size}`);
  console.log(`Ya tenían tipo (omitidos${FORCE ? ', pero --force los reasigna' : ''}): ${yaTienen}`);
  console.log(`Se asignarían: ${asignados}`);
  console.log('\n--- distribución de tipos a asignar ---');
  Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}  ${t}`));
  console.log(`\nSin match (${sinMatch.length >= 25 ? '25+ mostrados' : sinMatch.length}):`);
  sinMatch.forEach((n) => console.log('   ·', n));

  if (!WRITE) {
    console.log('\nDRY-RUN (no se escribió nada). Repite con --write para aplicar.');
    process.exit(0);
  }

  console.log(`\nEscribiendo ${updates.length} equipos…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) {
      batch.update(db.collection('equipment').doc(u.id), {
        tipo: u.tipo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    done += Math.min(400, updates.length - i);
    console.log(`  ${done}/${updates.length}`);
  }
  console.log('Listo.');
  process.exit(0);
})().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
