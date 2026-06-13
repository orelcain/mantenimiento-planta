#!/usr/bin/env node
/**
 * FASE 2 — plantAssets (levantamiento) → colección plana `repuestos`
 *
 * Convierte los 72 motores/bombas físicos del levantamiento en docs de la
 * colección top-level `repuestos` (modelo N:M aprobado 2026-06-10):
 *   - docId = codigoSAP si existe; si no, el plantAssetId.
 *   - Dedup por SAP: un SAP = UN doc; `equipos` = unión de los nodos donde sirve.
 *   - `equipos` = docIds de hierarchy (resueltos desde códigos del mapa).
 *   - Conserva specs físicas (marca/modelo/potencia/…) y fotos (imagenes → fotosReales).
 *   - NO crea ni mueve nodos de hierarchy. NO toca plantAssets (se eliminan en Fase 5).
 *   - Extra aprobado (Q12/Q13): alias en nodos 720004420 y 720004418.
 *
 * Mapa de entrada: scripts/normalizacion/plantassets-map.json (aprobado 2026-06-11).
 * Los 61 'asset-720…' (copias SAP) y el compresor N°3 (pendiente) NO se migran.
 *
 * Idempotente: docIds determinísticos; re-correr sobreescribe los mismos docs.
 *
 * Uso:
 *   node scripts/normalizacion/03-plantassets-to-repuestos.js           ← DRY-RUN
 *   node scripts/normalizacion/03-plantassets-to-repuestos.js --write   ← aplica
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
const WRITE = process.argv.includes('--write');

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'plantassets-map.json'), 'utf8'));

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 2 — PLANTASSETS → repuestos ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  // ── hierarchy: código → doc, y docId → doc ──
  const hSnap = await db.collection('hierarchy').get();
  const byCodigo = new Map();
  const byId = new Map();
  for (const d of hSnap.docs) {
    const data = d.data();
    byId.set(d.id, { id: d.id, ...data });
    const c = (data.codigo || '').trim();
    if (c) byCodigo.set(c, { id: d.id, ...data });
  }

  const resolveNode = (dest) => {
    if (dest.startsWith('id:')) return byId.get(dest.slice(3)) || null;
    return byCodigo.get(dest) || null;
  };

  // validar destinos ANTES de cualquier escritura
  const errores = [];
  for (const a of MAP.assets) {
    for (const dest of a.destinos) {
      const n = resolveNode(dest);
      if (!n) errores.push(`${a.plantAssetId}: destino ${dest} NO existe en hierarchy`);
      else if (n.tipoNodo === 'area') errores.push(`${a.plantAssetId}: destino ${dest} (${n.nombre}) es un ÁREA, no equipo`);
    }
  }
  if (errores.length) {
    console.error('❌ Errores de validación del mapa:\n  ' + errores.join('\n  '));
    process.exit(1);
  }

  // ── plantAssets en vivo ──
  const paSnap = await db.collection('plantAssets').get();
  const paById = new Map(paSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const faltantes = MAP.assets.filter((a) => !paById.has(a.plantAssetId));
  if (faltantes.length) {
    console.error('❌ plantAssets del mapa que no existen en vivo:\n  ' + faltantes.map((a) => a.plantAssetId).join('\n  '));
    process.exit(1);
  }

  // ── construir docs `repuestos` (dedup por SAP) ──
  const docs = new Map(); // docId → repuesto
  const firstNonEmpty = (...vals) => vals.find((v) => v != null && String(v).trim() !== '') ?? '';

  for (const m of MAP.assets) {
    const a = paById.get(m.plantAssetId);
    const docId = m.codigoSAP || m.plantAssetId;
    const nodos = m.destinos.map(resolveNode);
    const textoBreve = firstNonEmpty(a.descripcionSAP, `${(m.tipo || '').toUpperCase()} ${firstNonEmpty(a.marca)} ${firstNonEmpty(a.modeloTipo, a.modelo)}`.trim());

    let doc = docs.get(docId);
    if (!doc) {
      doc = {
        codigoSAP: m.codigoSAP, // null si no tiene
        textoBreve,
        descripcion: a.equipo || '',
        tipo: m.tipo, // 'motor' | 'bomba'
        marca: firstNonEmpty(a.marca),
        modeloTipo: firstNonEmpty(a.modeloTipo, a.modelo),
        codigoFabricante: firstNonEmpty(a.modeloTipo, a.modelo),
        potencia: firstNonEmpty(a.potencia),
        voltaje: firstNonEmpty(a.voltaje),
        corriente: firstNonEmpty(a.corriente),
        caudalM3h: firstNonEmpty(a.caudalM3h),
        eje: firstNonEmpty(a.eje),
        relacionReduccion: firstNonEmpty(a.relacionReduccion),
        observaciones: firstNonEmpty(a.observaciones),
        fotosReales: (a.imagenes || []).map((img) => ({ ...img })),
        equipos: [],
        equiposCodigos: [],
        parentRepuestoId: null,
        origen: { tipo: 'plantAsset', plantAssetIds: [], equiposLevantamiento: [] },
      };
      docs.set(docId, doc);
    } else {
      // merge (mismo SAP, otra instancia): unión de datos
      if (a.equipo && !doc.descripcion.includes(a.equipo)) doc.descripcion += ` · ${a.equipo}`;
      for (const img of a.imagenes || []) {
        if (!doc.fotosReales.some((f) => f.url === img.url)) doc.fotosReales.push({ ...img });
      }
      if (a.observaciones && !doc.observaciones.includes(a.observaciones)) {
        doc.observaciones = [doc.observaciones, a.observaciones].filter(Boolean).join('\n');
      }
      for (const k of ['marca', 'modeloTipo', 'potencia', 'voltaje', 'corriente', 'caudalM3h', 'eje', 'relacionReduccion']) {
        if (!doc[k]) doc[k] = firstNonEmpty(a[k]);
      }
    }
    for (const n of nodos) {
      if (!doc.equipos.includes(n.id)) {
        doc.equipos.push(n.id);
        doc.equiposCodigos.push((n.codigo || '').trim() || `s/c:${n.nombre}`);
      }
    }
    doc.origen.plantAssetIds.push(m.plantAssetId);
    if (a.equipo) doc.origen.equiposLevantamiento.push(a.equipo);
  }

  // ── alias de nodos (Q12/Q13) ──
  const aliasOps = [];
  for (const al of MAP._meta.aliasNodos || []) {
    const n = byCodigo.get(al.codigo);
    if (!n) { console.log(`  ⚠ alias: nodo ${al.codigo} no encontrado`); continue; }
    const actual = (n.alias || '').trim();
    if (actual === al.alias) aliasOps.push({ ...al, accion: 'ya está', nodeId: n.id });
    else if (!actual || al.force) aliasOps.push({ ...al, accion: actual ? `set (reemplaza "${actual}")` : 'set', nodeId: n.id });
    else aliasOps.push({ ...al, accion: `CONFLICTO (alias actual: "${actual}") — no se toca`, nodeId: n.id });
  }

  // ── reporte ──
  const fusionados = [...docs.entries()].filter(([, d]) => d.origen.plantAssetIds.length > 1);
  console.log(`\nAssets a migrar: ${MAP.assets.length} (de ${MAP.resumen.assetsLevantamiento}; pendientes: ${MAP.resumen.pendientes})`);
  console.log(`Docs `.concat('`repuestos`', ` a crear: ${docs.size} (${MAP.assets.length - docs.size} fusionados por SAP)`));
  console.log(`  con SAP: ${[...docs.values()].filter((d) => d.codigoSAP).length} | sin SAP: ${[...docs.values()].filter((d) => !d.codigoSAP).length}`);
  console.log(`  con fotos: ${[...docs.values()].filter((d) => d.fotosReales.length).length}`);
  console.log(`  N:M (2+ equipos): ${[...docs.values()].filter((d) => d.equipos.length > 1).length}`);
  console.log('\nFusiones por SAP:');
  for (const [id, d] of fusionados) {
    console.log(`  ${id}: ${d.origen.plantAssetIds.length} assets → equipos [${d.equiposCodigos.join(', ')}]`);
  }
  console.log('\nAlias de nodos:');
  for (const al of aliasOps) console.log(`  ${al.codigo} → "${al.alias}": ${al.accion}`);

  const report = {
    timestamp: new Date().toISOString(),
    modo: WRITE ? 'write' : 'dry-run',
    totales: {
      assetsMigrados: MAP.assets.length,
      docsRepuestos: docs.size,
      fusionadosPorSap: MAP.assets.length - docs.size,
      conSap: [...docs.values()].filter((d) => d.codigoSAP).length,
      nm2mas: [...docs.values()].filter((d) => d.equipos.length > 1).length,
    },
    aliasNodos: aliasOps,
    docs: Object.fromEntries([...docs.entries()].map(([id, d]) => [id, d])),
  };
  const reportPath = path.join(__dirname, '03-plantassets-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReporte completo: ${path.relative(ROOT, reportPath)}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Ninguna escritura. Revisar reporte y correr con --write.\n');
    process.exit(0);
  }

  // ── escritura ──
  const now = admin.firestore.FieldValue.serverTimestamp();
  const entries = [...docs.entries()];
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [docId, d] of entries.slice(i, i + 400)) {
      batch.set(db.collection('repuestos').doc(docId), { ...d, migradoEn: now, updatedAt: now, createdAt: now });
    }
    await batch.commit();
    written += Math.min(400, entries.length - i);
    console.log(`  …${written}/${entries.length} repuestos escritos`);
  }
  for (const al of aliasOps) {
    if (al.accion.startsWith('set')) {
      await db.collection('hierarchy').doc(al.nodeId).update({ alias: al.alias });
      console.log(`  alias ✓ ${al.codigo} → "${al.alias}"`);
    }
  }

  // ── verificación ──
  const verify = await db.collection('repuestos').get();
  const bad = [];
  for (const d of verify.docs) {
    const data = d.data();
    if (!Array.isArray(data.equipos) || data.equipos.length === 0) bad.push(`${d.id}: sin equipos`);
    for (const eq of data.equipos || []) if (!byId.has(eq)) bad.push(`${d.id}: equipo ${eq} no existe`);
  }
  console.log(`\n✓ Escritura completa: ${written} docs en `.concat('`repuestos`', `. Colección ahora: ${verify.size} docs.`));
  console.log(bad.length === 0 ? '✓ Verificación: todos los docs tienen equipos válidos.' : `⚠ Problemas:\n  ${bad.join('\n  ')}`);
  process.exit(bad.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
