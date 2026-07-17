/**
 * backfill-repuestos-area-ids — puebla `areaIds` en los ~7.700 docs existentes
 * de la colección `repuestos`.
 *
 * `areaIds` = unión de {equipo + todos sus ancestros en `hierarchy`} para cada
 * nodeId en `equipos[]`. Permite filtrar repuestos por área del lado del
 * servidor (`where('areaIds','array-contains', areaId)`) en vez de bajar el
 * maestro COMPLETO cada vez que se mira un área — ver
 * apps/pwa/src/hooks/repuestos/useHierarchyPaths.ts (computeAreaIds/build,
 * MISMA lógica de ancestría, reimplementada acá porque este script corre en
 * Node puro sin bundler y no puede importar un módulo TS de la app).
 *
 * Repuestos SIN `equipos` (materiales transversales: insumos, herramientas —
 * ~39% del maestro) reciben `areaIds: []` — a propósito: solo se muestran en
 * "todas las áreas", nunca en la vista acotada de un área puntual.
 *
 * Idempotente: sin --force, solo escribe docs sin `areaIds` o cuyo `areaIds`
 * calculado difiere del guardado (repuesto cuyos `equipos` cambiaron desde la
 * última corrida). Los flujos de creación/edición ya mantienen `areaIds` al
 * día (useRepuestoCrud) — este script es para el backlog inicial y para
 * re-sincronizar si el árbol de `hierarchy` cambió de forma masiva.
 *
 *   node scripts/backfill-repuestos-area-ids.js            ← DRY-RUN (no escribe)
 *   node scripts/backfill-repuestos-area-ids.js --write    ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

function buildAncestorsMap(nodes) {
  const parentOf = new Map();
  for (const n of nodes) parentOf.set(n.id, n.parentId);
  const out = new Map();
  for (const n of nodes) {
    const s = new Set([n.id]);
    for (const a of n.path) s.add(a);
    let cur = n.parentId, guard = 0;
    while (cur && guard++ < 30) { s.add(cur); cur = parentOf.get(cur) ?? null; }
    out.set(n.id, s);
  }
  return out;
}

function unionAncestors(map, equipoIds) {
  const out = new Set();
  for (const eq of equipoIds) {
    const ancestors = map.get(eq);
    if (ancestors) for (const a of ancestors) out.add(a);
    else out.add(eq); // nodo no encontrado (raro) — igual queda matcheable por su propio id
  }
  return [...out];
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

(async () => {
  console.log('Cargando hierarchy + repuestos…');
  const [hierSnap, repSnap] = await Promise.all([
    db.collection('hierarchy').get(),
    db.collection('repuestos').get(),
  ]);

  const nodes = hierSnap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, parentId: x.parentId || null, path: Array.isArray(x.path) ? x.path : [] };
  });
  const ancestorsMap = buildAncestorsMap(nodes);

  const updates = [];
  let sinEquipos = 0, yaAlDia = 0;
  const dist = new Map(); // cantidad de áreas resultantes → conteo de docs (sanity check)

  repSnap.docs.forEach((d) => {
    const x = d.data();
    const equipos = Array.isArray(x.equipos) ? x.equipos : [];
    const nuevo = equipos.length === 0 ? [] : unionAncestors(ancestorsMap, equipos);
    if (equipos.length === 0) sinEquipos++;

    const actual = Array.isArray(x.areaIds) ? x.areaIds : null;
    if (actual !== null && sameSet(actual, nuevo)) { yaAlDia++; return; }

    updates.push({ id: d.id, areaIds: nuevo });
    dist.set(nuevo.length, (dist.get(nuevo.length) || 0) + 1);
  });

  console.log(`\nRepuestos totales: ${repSnap.size}`);
  console.log(`Sin equipos (areaIds quedará []): ${sinEquipos}`);
  console.log(`Ya al día (sin cambios): ${yaAlDia}`);
  console.log(`A actualizar: ${updates.length}`);
  console.log('\nDistribución de |areaIds| entre los que se van a actualizar:');
  [...dist.entries()].sort((a, b) => a[0] - b[0]).forEach(([n, c]) => console.log(`  ${n} áreas: ${c} docs`));

  if (!WRITE) {
    console.log('\nDRY-RUN (no se escribió nada). Repite con --write para aplicar.');
    process.exit(0);
  }

  console.log(`\nEscribiendo ${updates.length} repuestos…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + 400);
    for (const u of chunk) {
      batch.update(db.collection('repuestos').doc(u.id), { areaIds: u.areaIds });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  ${done}/${updates.length}`);
  }
  console.log('\nListo.');
  process.exit(0);
})();
