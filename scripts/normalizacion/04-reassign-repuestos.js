#!/usr/bin/env node
/**
 * FASE 3 — machines/{id}/repuestos → colección plana `repuestos`
 *
 * Migra los ~4711 repuestos de las 14 máquinas con repuestos a la colección
 * top-level `repuestos` según scripts/normalizacion/reconciliation-map.json
 * (modelo N:M aprobado 2026-06-10/11):
 *   - docId = codigoSAP real si existe; si no, el docId actual del repuesto
 *     (con sufijo __<machineId> solo si colisiona entre máquinas).
 *   - Dedup por SAP: un SAP = UN doc. `equipos` = unión de los destinoNodos de
 *     todas las máquinas donde aparece (fusión cross-modelo aprobada: Baader
 *     142+200, familia Marel). Texto: se conserva el doc "más completo"
 *     (más campos no vacíos; empate → updatedAt más reciente); el resto de
 *     campos se rellenan de los otros docs y todo queda trazado en `origen`.
 *   - Merge con docs YA existentes en `repuestos` (los 65 de Fase 2): si un SAP
 *     coincide, se agregan equipos/orígenes sin perder specs/fotos del asset.
 *   - También migra los 2 repuestos de hierarchy/{id}/repuestos (Grader), con su
 *     stockFisico/stockHistorial. El mototambor "cinta aceleracion 1 y 2"
 *     queda N:M en ambas cintas (720004467 + 720004469), según su descripción.
 *   - "Pendiente"/"" como codigoSAP se tratan como SIN SAP (codigoSAP: null).
 *   - ADITIVO: no borra ni modifica machines/* ni hierarchy/* (limpieza = Fase 5).
 *
 * Idempotente: docIds determinísticos; re-correr reconstruye los mismos docs.
 *
 * Uso:
 *   node scripts/normalizacion/04-reassign-repuestos.js           ← DRY-RUN
 *   node scripts/normalizacion/04-reassign-repuestos.js --write   ← aplica
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
  console.error('❌ Falta serviceAccountKey.json en la raíz.');
  process.exit(1);
}
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'reconciliation-map.json'), 'utf8'));
const isRealSap = (s) => /^\d{6,}$/.test((s || '').trim());

// machine.nombre del mapa → docId de machines (los nombres del mapa son los de la colección)
const MACHINE_IDS = {
  'Baader 142': 'baader-142', 'Knuro': 'knuro', 'Baader 200': 'baader-200', 'GEA V2': 'gea-v2',
  'Marel Filete': 'marel-filete', 'Marel Eviscerado': 'marel-eviscerado', 'Marel HG': 'marel-pendiente',
  'Grader': 'grader', 'Impresora Videojet': 'impresora-videojet', 'Garibaldi': 'garibaldi',
  'Detector de Metales': 'detector-metales', 'Fishken': 'fishken',
  'Cinta Elevadora 1 Cuello Cisnes': 'mLIsv7vIVLyEnBrAXlXj',
  'Bomba caseta agua mar 40/26': 'w0bdEDY82jZoqiA6R3MN',
  // subcolecciones huérfanas (doc padre borrado) — aprobado 2026-06-11
  'Multivac (huérfana)': 'multivac',
  'Motor Cinta fishken (huérfano)': 'SW2RNI1RCdqSQbslwnKZ',
};

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 3 — machines/*/repuestos → repuestos ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  // ── hierarchy ──
  const hSnap = await db.collection('hierarchy').get();
  const byCodigo = new Map();
  const byNombre = new Map(); // solo nodos sin código
  const byId = new Map();
  for (const d of hSnap.docs) {
    const data = d.data();
    byId.set(d.id, { id: d.id, ...data });
    const c = (data.codigo || '').trim();
    if (c) byCodigo.set(c, { id: d.id, ...data });
    else byNombre.set((data.nombre || '').trim().toUpperCase(), { id: d.id, ...data });
  }
  const resolveDest = (dest) => {
    const m = dest.match(/^<(.+)>$/);
    if (m) return byNombre.get(m[1].trim().toUpperCase()) || null;
    return byCodigo.get(dest) || null;
  };

  // validar mapa
  const machineDest = new Map(); // machineId → [nodos]
  const errores = [];
  for (const entry of MAP.mapa) {
    const mid = MACHINE_IDS[entry.machine];
    if (!mid) { errores.push(`machine "${entry.machine}" sin id conocido`); continue; }
    const nodos = entry.destinoNodos.map((d) => {
      const n = resolveDest(d);
      if (!n) errores.push(`${entry.machine}: destino ${d} no existe en hierarchy`);
      return n;
    }).filter(Boolean);
    machineDest.set(mid, nodos);
  }
  if (errores.length) {
    console.error('❌ Errores del mapa:\n  ' + errores.join('\n  '));
    process.exit(1);
  }

  // ── docs existentes en `repuestos` (Fase 2) ──
  const existSnap = await db.collection('repuestos').get();
  const docs = new Map(); // docId → data (mutable)
  for (const d of existSnap.docs) docs.set(d.id, d.data());
  const existentes = existSnap.size;

  // ── leer repuestos de machines ──
  const porMaquina = {};
  let totalLeidos = 0;
  for (const [mid] of machineDest) {
    const snap = await db.collection('machines').doc(mid).collection('repuestos').get();
    porMaquina[mid] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    totalLeidos += snap.size;
  }

  // ── helpers de merge ──
  const countFilled = (r) => Object.values(r).filter((v) => v != null && String(v).trim() !== '' && !(Array.isArray(v) && v.length === 0)).length;
  const tsOf = (r) => (r.updatedAt && r.updatedAt._seconds) || (r.updatedAt && r.updatedAt.seconds) || 0;
  const cleanUndef = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

  const addEquipos = (doc, nodos) => {
    doc.equipos = doc.equipos || [];
    doc.equiposCodigos = doc.equiposCodigos || [];
    for (const n of nodos) {
      if (!doc.equipos.includes(n.id)) {
        doc.equipos.push(n.id);
        doc.equiposCodigos.push((n.codigo || '').trim() || `s/c:${n.nombre}`);
      }
    }
  };

  // claves no-SAP usadas, para detectar colisiones entre máquinas
  const usedNoSapIds = new Map(); // docId → machineId origen
  let colisiones = 0, dedupSap = 0, mergeConFase2 = 0;

  const mergeInto = (docId, rep, mid, nodos) => {
    const base = docs.get(docId);
    const { id: _omit, ...fields } = rep;
    const sap = isRealSap(rep.codigoSAP) ? rep.codigoSAP.trim() : null;
    if (!base) {
      const nuevo = cleanUndef({
        ...fields,
        codigoSAP: sap,
        parentRepuestoId: null,
        origen: { tipo: 'machine', machines: [mid], repuestoIds: [`${mid}/${rep.id}`] },
      });
      if (!sap && (rep.codigoSAP || '').trim()) nuevo.codigoSAPOriginal = rep.codigoSAP; // ej. "Pendiente"
      docs.set(docId, nuevo);
      addEquipos(nuevo, nodos);
      return;
    }
    // ya existe (mismo SAP desde otra máquina, o doc de Fase 2)
    const esFase2 = base.origen && base.origen.tipo === 'plantAsset';
    if (esFase2) mergeConFase2++; else dedupSap++;
    // elegir "más completo" para los campos de texto principales
    const preferRep = !esFase2 && (countFilled(fields) > countFilled(base) || (countFilled(fields) === countFilled(base) && tsOf(fields) > tsOf(base)));
    const principal = preferRep ? fields : base;
    const secundario = preferRep ? base : fields;
    const merged = { ...secundario, ...cleanUndef({ ...principal }) };
    // no perder campos llenos del secundario que el principal tenga vacíos
    for (const [k, v] of Object.entries(secundario)) {
      const cur = merged[k];
      if ((cur == null || String(cur).trim() === '' || (Array.isArray(cur) && cur.length === 0)) && v != null) merged[k] = v;
    }
    merged.codigoSAP = base.codigoSAP || sap;
    merged.parentRepuestoId = base.parentRepuestoId ?? null;
    merged.equipos = base.equipos || [];
    merged.equiposCodigos = base.equiposCodigos || [];
    merged.origen = base.origen && base.origen.tipo ? base.origen : { tipo: 'machine', machines: [], repuestoIds: [] };
    if (merged.origen.tipo === 'plantAsset') {
      merged.origen = { ...merged.origen, machines: [...(merged.origen.machines || []), mid], repuestoIds: [...(merged.origen.repuestoIds || []), `${mid}/${rep.id}`] };
    } else {
      if (!merged.origen.machines.includes(mid)) merged.origen.machines.push(mid);
      merged.origen.repuestoIds.push(`${mid}/${rep.id}`);
    }
    docs.set(docId, merged);
    addEquipos(merged, nodos);
  };

  for (const [mid, reps] of Object.entries(porMaquina)) {
    const nodos = machineDest.get(mid);
    for (const rep of reps) {
      const sap = isRealSap(rep.codigoSAP) ? rep.codigoSAP.trim() : null;
      let docId = sap || rep.id;
      if (!sap) {
        const owner = usedNoSapIds.get(docId);
        if (owner && owner !== mid) { docId = `${rep.id}__${mid}`; colisiones++; }
        usedNoSapIds.set(docId, mid);
      }
      mergeInto(docId, rep, mid, nodos);
    }
  }

  // ── los 2 repuestos de hierarchy/*/repuestos (Grader) ──
  const HIER_REP = [
    { nodeId: '1bshVskZHC0eZTncAgQX', extraEquipos: ['720004469'], nota: 'mototambor sirve a cintas 1 y 2 (descripción)' },
    { nodeId: 'uLtr5iGJPmaDgiODrdJv', extraEquipos: [], nota: '' },
  ];
  let hierMigrados = 0;
  for (const h of HIER_REP) {
    const snap = await db.collection('hierarchy').doc(h.nodeId).collection('repuestos').get();
    for (const d of snap.docs) {
      const rep = { id: d.id, ...d.data() };
      const sap = isRealSap(rep.codigoSAP) ? rep.codigoSAP.trim() : null;
      const docId = sap || rep.id;
      const nodos = [byId.get(h.nodeId), ...h.extraEquipos.map((c) => byCodigo.get(c))].filter(Boolean);
      mergeInto(docId, rep, `hierarchy:${h.nodeId}`, nodos);
      hierMigrados++;
    }
  }

  // ── resumen ──
  const all = [...docs.values()];
  const conSap = all.filter((d) => d.codigoSAP).length;
  const nm = all.filter((d) => (d.equipos || []).length > 1).length;
  const sinEquipos = all.filter((d) => !(d.equipos || []).length);
  console.log(`\nRepuestos leídos de machines: ${totalLeidos} (${Object.keys(porMaquina).length} máquinas) + ${hierMigrados} de hierarchy/*/repuestos`);
  console.log(`Docs existentes en `.concat('`repuestos`', ` (Fase 2): ${existentes}`));
  console.log(`Docs finales: ${docs.size}`);
  console.log(`  fusiones por SAP entre máquinas: ${dedupSap} | merges con docs de Fase 2: ${mergeConFase2}`);
  console.log(`  colisiones de id sin-SAP resueltas con sufijo: ${colisiones}`);
  console.log(`  con SAP: ${conSap} | sin SAP: ${docs.size - conSap} | N:M (2+ equipos): ${nm}`);
  if (sinEquipos.length) console.log(`  ⚠ docs sin equipos: ${sinEquipos.length}`);

  // top fusiones para revisión
  const fusionados = [...docs.entries()]
    .filter(([, d]) => d.origen && d.origen.tipo === 'machine' && (d.origen.machines || []).length > 1)
    .sort((a, b) => b[1].origen.machines.length - a[1].origen.machines.length);
  console.log(`\nEjemplos de fusión cross-máquina (${fusionados.length} docs):`);
  for (const [id, d] of fusionados.slice(0, 8)) {
    console.log(`  ${id} "${(d.textoBreve || '').slice(0, 40)}": ${d.origen.machines.join('+')} → ${d.equipos.length} equipos`);
  }
  const conPlantAsset = [...docs.entries()].filter(([, d]) => d.origen && d.origen.tipo === 'plantAsset' && (d.origen.machines || []).length);
  if (conPlantAsset.length) {
    console.log(`\nMerges con repuestos de Fase 2 (${conPlantAsset.length}):`);
    for (const [id, d] of conPlantAsset.slice(0, 8)) console.log(`  ${id} "${(d.textoBreve || '').slice(0, 40)}" ← machines ${d.origen.machines.join('+')}`);
  }

  // ejemplo Baader 142: el soporte 3300011612
  const ejemplo = docs.get('3300011612');
  if (ejemplo) {
    console.log('\nEjemplo 3300011612 (soporte compartido 142+200):');
    console.log(`  equipos (${ejemplo.equipos.length}): ${ejemplo.equiposCodigos.join(', ')}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    modo: WRITE ? 'write' : 'dry-run',
    totales: {
      leidosMachines: totalLeidos, leidosHierarchy: hierMigrados, existentesFase2: existentes,
      docsFinales: docs.size, dedupSap, mergeConFase2, colisiones, conSap, nm2mas: nm, sinEquipos: sinEquipos.length,
    },
    fusionesCrossMachine: Object.fromEntries(fusionados.map(([id, d]) => [id, { textoBreve: d.textoBreve, machines: d.origen.machines, equiposCodigos: d.equiposCodigos }])),
  };
  const reportPath = path.join(__dirname, '04-reassign-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReporte: ${path.relative(ROOT, reportPath)}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Ninguna escritura. Revisar y correr con --write.\n');
    process.exit(0);
  }

  // ── escritura ──
  const now = admin.firestore.FieldValue.serverTimestamp();
  const entries = [...docs.entries()];
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [docId, d] of entries.slice(i, i + 400)) {
      batch.set(db.collection('repuestos').doc(docId), { ...d, migradoEn: d.migradoEn || now, updatedAt: now, createdAt: d.createdAt || now });
    }
    await batch.commit();
    written += Math.min(400, entries.length - i);
    if (written % 1200 === 0 || written === entries.length) console.log(`  …${written}/${entries.length} escritos`);
  }

  // verificación
  const verify = await db.collection('repuestos').get();
  const bad = [];
  for (const d of verify.docs) {
    const data = d.data();
    if (!Array.isArray(data.equipos) || data.equipos.length === 0) bad.push(`${d.id}: sin equipos`);
    else for (const eq of data.equipos) if (!byId.has(eq)) bad.push(`${d.id}: equipo ${eq} no existe`);
  }
  console.log(`\n✓ Escritura completa: ${written} docs. Colección `.concat('`repuestos`', `: ${verify.size} docs.`));
  console.log(bad.length === 0 ? '✓ Verificación: todos los docs tienen equipos válidos.' : `⚠ Problemas (${bad.length}):\n  ${bad.slice(0, 20).join('\n  ')}`);
  process.exit(bad.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
