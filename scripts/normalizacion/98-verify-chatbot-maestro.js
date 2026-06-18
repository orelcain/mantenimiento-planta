#!/usr/bin/env node
/**
 * 98-verify-chatbot-maestro — SOLO LECTURA. Verifica que la migración del
 * chatbot al maestro `repuestos` devuelve resultados correctos. Replica el
 * núcleo del matching (normalize + includes + scope por equipo) sobre los
 * datos reales y muestra qué encontraría ARIA para queries de muestra.
 *
 *   node scripts/normalizacion/98-verify-chatbot-maestro.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(ROOT, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
const isSap = (s) => /^\d{6,}$/.test(String(s || '').trim());

(async () => {
  const [hierSnap, repSnap, bodegaSnap] = await Promise.all([
    db.collection('hierarchy').get(),
    db.collection('repuestos').get(),
    db.collection('bodega').get(),
  ]);

  const nodeName = new Map();
  const equipoNodes = [];
  hierSnap.forEach((d) => {
    const n = d.data();
    const label = String(n.alias || n.nombre || d.id);
    nodeName.set(d.id, label);
    if (n.tipoNodo === 'equipo') equipoNodes.push({ id: d.id, norm: normalize(label) });
  });

  const stockBySap = new Map();
  bodegaSnap.forEach((d) => { const b = d.data(); stockBySap.set(String(b.codigoSAP || d.id).trim(), Number(b.stockActual ?? 0)); });

  const materials = repSnap.docs.map((d) => {
    const r = d.data();
    const sap = String(r.codigoSAP || '').trim();
    const equipos = Array.isArray(r.equipos) ? r.equipos.filter(Boolean) : [];
    return {
      textoBreve: r.textoBreve || r.descripcion || '(sin nombre)',
      sap, tieneSap: isSap(sap), clase: r.clase || 'repuesto',
      equipos,
      hay: normalize(`${r.textoBreve || ''} ${r.descripcion || ''} ${sap} ${r.codigoFabricante || ''} ${r.alias || ''} ${r.marca || ''} ${r.modeloTipo || ''} ${r.clase || ''} ${(r.equiposCodigos || []).join(' ')} ${equipos.map((id) => nodeName.get(id) || '').join(' ')}`),
    };
  });
  const stockOf = (m) => (m.tieneSap ? stockBySap.get(m.sap) || 0 : 0);

  const COMPONENT_WORDS = new Set(['motor', 'bomba', 'sensor', 'filtro', 'correa', 'sello', 'valvula', 'reductor', 'rodamiento', 'cinta', 'cilindro', 'variador', 'compresor']);

  const run = (q) => {
    const nq = normalize(q);
    const terms = nq.split(' ').filter((t) => t.length > 2);
    // detección de equipo
    const nodeIds = new Set();
    const remove = new Set();
    for (const node of equipoNodes) {
      if (!node.norm) continue;
      const words = node.norm.split(' ').filter((w) => w.length > 2);
      if (node.norm.length >= 4 && nq.includes(node.norm)) {
        nodeIds.add(node.id); words.forEach((w) => { if (!COMPONENT_WORDS.has(w)) remove.add(w); });
      } else {
        for (const w of words) if (w.length >= 4 && !COMPONENT_WORDS.has(w) && terms.includes(w)) { nodeIds.add(node.id); remove.add(w); }
      }
    }
    const comp = nodeIds.size > 0 ? terms.filter((t) => !remove.has(t)) : terms;
    const scope = (m) => nodeIds.size === 0 || m.equipos.some((id) => nodeIds.has(id));
    let matched = materials.filter((m) => scope(m) && (comp.length === 0 ? nodeIds.size > 0 : comp.every((t) => m.hay.includes(t))));
    let mode = 'scoped';
    // Fallback GLOBAL flexible (any-term) cuando el scope da 0
    if (matched.length === 0) {
      matched = materials.filter((m) => terms.some((t) => m.hay.includes(t)))
        .map((m) => ({ m, hits: terms.filter((t) => m.hay.includes(t)).length }))
        .sort((a, b) => b.hits - a.hits).slice(0, 30).map((x) => x.m);
      mode = 'GLOBAL';
    }
    matched.sort((a, b) => (stockOf(b) > 0) - (stockOf(a) > 0));
    const eq = [...nodeIds].map((id) => nodeName.get(id)).join(', ') || '(ninguno)';
    console.log(`\n▶ "${q}"  → equipo=[${(eq).slice(0, 60)}] comp=[${comp.join(' ')}]  → ${matched.length} matches (${mode})`);
    matched.slice(0, 6).forEach((m) => {
      const st = !m.tieneSap ? 'despiece' : stockOf(m) > 0 ? `${stockOf(m)} en stock` : 'sin stock';
      console.log(`   · ${m.textoBreve.slice(0, 45).padEnd(45)} | SAP ${(m.sap || 'sin').padEnd(10)} | ${m.clase.padEnd(8)} | ${st}`);
    });
  };

  console.log(`Maestro: ${materials.length} materiales · equipos hierarchy: ${equipoNodes.length} · SAP con stock: ${stockBySap.size}`);
  ['sumitomo', 'baader casquillo', 'guantes', 'rodamiento', 'aceite hidraulico', 'sello mecanico', 'motores grader', 'xyzqnoexiste'].forEach(run);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
