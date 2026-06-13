#!/usr/bin/env node
/**
 * FASE 0 — Auditoría de RECONCILIACIÓN (READ-ONLY)
 *
 * Propone, sin escribir nada, a qué nodo-equipo de la lista SAP (`hierarchy`)
 * se reconcilia cada `machine` (alias) y cada `plantAsset` (que se colgará como
 * REPUESTO, no como nodo). Usa matching difuso por token-overlap acotado al área,
 * con score de confianza. El matching automático es solo un BORRADOR: lo que
 * importa es la lista de DUDOSOS que el usuario debe resolver a mano — los
 * nombres informales ("Baader 142", "Cinta Fishken") son ambiguos y el
 * token-overlap genera falsos positivos.
 *
 * Salida: output/normalizacion/audit-map-<ts>.json + audit-dudosos-<ts>.csv
 * Uso:  node scripts/normalizacion/01-audit-map.js
 * Requiere serviceAccountKey.json en la raíz (o GOOGLE_APPLICATION_CREDENTIALS).
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const keyPath = path.join(ROOT, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error('❌ Falta serviceAccountKey.json en la raíz (o GOOGLE_APPLICATION_CREDENTIALS).');
  process.exit(1);
}
const db = admin.firestore();

// ── Tokenización / matching ──
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'n', 'y', 'a', 'con', 'para', 'sin', 'planta']);
const toks = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
const isEquipo = (c) => /^7\d{8}$/.test((c || '').trim()) || /^3300\d{6}$/.test((c || '').trim());

// Umbrales de confianza (validados con datos reales 2026-06-10)
const STRONG = 0.6; // score >= y 1 solo candidato → 'fuerte'
const MAYBE = 0.34; // score >= → 'dudoso'; por debajo → 'sin-match'

(async () => {
  const hSnap = await db.collection('hierarchy').get();
  const nodes = hSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestors = (id) => {
    const out = new Set(); let cur = byId.get(id); let g = 0;
    while (cur && g++ < 20) { out.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : null; }
    return out;
  };
  const equipos = nodes.filter((n) => isEquipo(n.codigo)).map((n) => ({ ...n, _t: toks(n.nombre) }));

  // Mejor nodo-equipo para un nombre informal, acotado al área (si se conoce)
  const bestMatch = (nombre, areaNodeId) => {
    const mt = toks(nombre);
    if (!mt.length) return { score: 0, ties: 0, node: null };
    const scope = areaNodeId ? ancestors(areaNodeId) : null;
    let best = null, bestScore = 0, ties = 0;
    for (const e of equipos) {
      if (scope && ![...ancestors(e.id)].some((x) => scope.has(x))) continue;
      const shared = e._t.filter((t) => mt.includes(t)).length;
      if (!shared) continue;
      const score = shared / mt.length;
      if (score > bestScore) { bestScore = score; best = e; ties = 1; }
      else if (score === bestScore) ties++;
    }
    return { score: bestScore, ties, node: best };
  };
  const classify = (r) => (r.score >= STRONG && r.ties === 1 ? 'fuerte' : r.score >= MAYBE ? 'dudoso' : 'sin-match');

  // ── machines → nodo-equipo SAP (alias) ──
  const machines = (await db.collection('machines').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const mReport = [];
  for (const mm of machines) {
    const r = bestMatch(mm.nombre, mm.hierarchyNodeId);
    const repSnap = await db.collection('machines').doc(mm.id).collection('repuestos').get();
    mReport.push({
      machineId: mm.id, nombre: mm.nombre, repuestos: repSnap.size,
      destinoId: r.node?.id || '', destinoNombre: r.node?.nombre || '', destinoCodigo: r.node?.codigo || '',
      score: Math.round(r.score * 100), empates: r.ties, clase: classify(r),
    });
  }

  // ── plantAssets → nodo-equipo SAP (donde colgará como repuesto) ──
  const plantAssets = (await db.collection('plantAssets').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const paReport = [];
  for (const a of plantAssets) {
    const nombre = a.equipo || a.denominacion || '';
    const r = bestMatch(nombre, a.hierarchyNodeId);
    paReport.push({
      plantAssetId: a.id, nombre, tipo: a.tipo || '', marca: a.marca || '', modelo: a.modeloTipo || a.modelo || '',
      destinoId: r.node?.id || '', destinoNombre: r.node?.nombre || '', destinoCodigo: r.node?.codigo || '',
      score: Math.round(r.score * 100), empates: r.ties, clase: classify(r),
    });
  }

  const dudosos = [
    ...mReport.filter((r) => r.clase !== 'fuerte').map((r) => ({ origen: 'machine', ...r })),
    ...paReport.filter((r) => r.clase !== 'fuerte').map((r) => ({ origen: 'plantAsset', ...r })),
  ];
  const count = (arr, c) => arr.filter((r) => r.clase === c).length;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const OUT = path.join(ROOT, 'output', 'normalizacion');
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    timestamp: stamp,
    nota: 'Matching automático = BORRADOR. Resolver los DUDOSOS a mano antes de migrar.',
    resumen: {
      machines: { total: machines.length, fuerte: count(mReport, 'fuerte'), dudoso: count(mReport, 'dudoso'), sinMatch: count(mReport, 'sin-match'), repuestosTotales: mReport.reduce((s, r) => s + r.repuestos, 0) },
      plantAssets: { total: plantAssets.length, fuerte: count(paReport, 'fuerte'), dudoso: count(paReport, 'dudoso'), sinMatch: count(paReport, 'sin-match') },
      dudososParaRevision: dudosos.length,
    },
    machines: mReport, plantAssets: paReport, dudosos,
  };
  fs.writeFileSync(path.join(OUT, `audit-map-${stamp}.json`), JSON.stringify(report, null, 2));

  const csv = ['origen,id,nombre,clase,score,empates,destinoPropuesto,destinoCodigo']
    .concat(dudosos.map((r) => [r.origen, r.machineId || r.plantAssetId, `"${(r.nombre || '').replace(/"/g, '')}"`, r.clase, r.score, r.empates, `"${(r.destinoNombre || '').replace(/"/g, '')}"`, r.destinoCodigo].join(',')))
    .join('\n');
  fs.writeFileSync(path.join(OUT, `audit-dudosos-${stamp}.csv`), csv);

  console.log('\n' + '='.repeat(64));
  console.log('FASE 0 — AUDITORÍA DE RECONCILIACIÓN (read-only)');
  console.log('='.repeat(64));
  console.log(JSON.stringify(report.resumen, null, 2));
  console.log('\n✓ Reporte:', path.relative(ROOT, path.join(OUT, `audit-map-${stamp}.json`)));
  console.log('✓ Dudosos a resolver a mano:', path.relative(ROOT, path.join(OUT, `audit-dudosos-${stamp}.csv`)));
  console.log('  (Ninguna escritura en Firestore — solo lectura.)\n');
  process.exit(0);
})().catch((e) => {
  console.error('❌ Error en auditoría:', e.message);
  process.exit(1);
});
