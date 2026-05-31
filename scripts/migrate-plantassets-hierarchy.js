#!/usr/bin/env node
/**
 * Migración Fase 0 — Vincular plantAssets a la jerarquía (área-first).
 *
 * Lee scripts/levantamiento-import/area-hierarchy-map.json (mapa subárea -> codigo)
 * y, para cada PlantAsset cuyo `subarea` esté en el mapa, escribe:
 *   - hierarchyNodeId : el docId real del nodo en la colección `hierarchy`
 *   - hierarchyPath   : path legible "CHONCHI > ... > NODO"
 *
 * La clave estable de `hierarchy` es el campo `codigo` (los docId son auto-generados),
 * así que resolvemos codigo -> docId consultando la colección en runtime.
 *
 * También crea los `newNodes` del mapa que falten (ej. SISTEMA VACIO), idempotente.
 *
 * Uso:
 *   node scripts/migrate-plantassets-hierarchy.js --dry-run     # no escribe nada
 *   node scripts/migrate-plantassets-hierarchy.js               # aplica (idempotente)
 *   node scripts/migrate-plantassets-hierarchy.js --force       # reescribe aunque ya tenga vínculo
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

const MAP_PATH = path.join(__dirname, 'levantamiento-import', 'area-hierarchy-map.json');
const HIERARCHY = 'hierarchy';
const ASSETS = 'plantAssets';

const normalize = (v) =>
  String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ── Init Firebase Admin (mismo patrón que seed-levantamiento.js) ──
try {
  const saPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(saPath)) {
    config = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
    console.log('✅ serviceAccountKey.json encontrada');
  } else {
    console.log('⚠️  serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS');
  }
  if (!admin.apps.length) {
    admin.initializeApp(config ? { credential: admin.credential.cert(config) } : {});
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

/** Carga todos los nodos de hierarchy → Map<codigo, {id, nombre, parentId, nivel, path}>. */
async function loadHierarchy() {
  const snap = await db.collection(HIERARCHY).get();
  const byCodigo = new Map();
  const byId = new Map();
  snap.forEach((doc) => {
    const d = doc.data();
    const node = {
      id: doc.id,
      codigo: d.codigo,
      nombre: d.nombre,
      parentId: d.parentId ?? null,
      nivel: typeof d.nivel === 'number' ? d.nivel : 0,
      path: Array.isArray(d.path) ? d.path : [],
      activo: d.activo !== false,
    };
    byId.set(doc.id, node);
    if (d.codigo) byCodigo.set(d.codigo, node);
  });
  return { byCodigo, byId };
}

/** Path legible "A > B > C" para un nodo (ancestros + su propio nombre).
 *  Usa node.path (array de docId ancestros); si viene vacío, reconstruye
 *  caminando la cadena de parentId (algunos nodos no tienen path[] poblado). */
function readablePath(node, byId) {
  let ancestorIds = node.path || [];
  if (ancestorIds.length === 0 && node.parentId) {
    const chain = [];
    let cur = byId.get(node.parentId);
    let guard = 0;
    while (cur && guard++ < 20) {
      chain.unshift(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    ancestorIds = chain;
  }
  const names = ancestorIds.map((pid) => byId.get(pid)?.nombre).filter(Boolean);
  names.push(node.nombre);
  return names.join(' > ');
}

/** Asegura que un nodo nuevo exista (idempotente por codigo). Devuelve el nodo. */
async function ensureNode(newNode, hier) {
  const existing = hier.byCodigo.get(newNode.codigo);
  if (existing) {
    console.log(`  ℹ️  Nodo ya existe (skip): ${newNode.codigo} — ${existing.nombre}`);
    return existing;
  }
  const parent = hier.byCodigo.get(newNode.padreCodigo);
  if (!parent) {
    throw new Error(`No se puede crear ${newNode.codigo}: padre ${newNode.padreCodigo} no existe en hierarchy`);
  }
  const pathArr = [...(parent.path || []), parent.id];
  const nivel = (parent.nivel || 0) + 1;
  // orden = nº de hijos actuales del padre + 1
  let orden = 1;
  hier.byId.forEach((n) => { if (n.parentId === parent.id) orden++; });

  const payload = {
    nombre: newNode.nombre,
    codigo: newNode.codigo,
    parentId: parent.id,
    nivel,
    orden,
    path: pathArr,
    activo: true,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isDryRun) {
    console.log(`  ✓ [DRY] CREARÍA nodo ${newNode.codigo} — ${newNode.nombre} (nivel ${nivel}, padre ${parent.codigo})`);
    // Simular para resolver assets en dry-run
    const fake = { id: `(nuevo:${newNode.codigo})`, ...payload };
    hier.byCodigo.set(newNode.codigo, fake);
    hier.byId.set(fake.id, fake);
    return fake;
  }

  const ref = db.collection(HIERARCHY).doc();
  await ref.set(payload);
  const created = { id: ref.id, ...payload };
  hier.byCodigo.set(newNode.codigo, created);
  hier.byId.set(ref.id, created);
  console.log(`  ✅ Nodo creado: ${newNode.codigo} — ${newNode.nombre} (docId ${ref.id})`);
  return created;
}

async function main() {
  const mapDoc = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  const subareaToCodigo = mapDoc.map || {};
  const newNodes = mapDoc.newNodes || [];

  console.log('\n' + '='.repeat(68));
  console.log('🔗 MIGRACIÓN plantAssets → hierarchy (Fase 0)');
  console.log('='.repeat(68));
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (no escribe)' : isForce ? 'APLICAR --force' : 'APLICAR'}\n`);

  const hier = await loadHierarchy();
  console.log(`📚 hierarchy: ${hier.byId.size} nodos cargados\n`);

  // 1) Crear nodos nuevos faltantes
  console.log('— Nodos nuevos —');
  for (const nn of newNodes) await ensureNode(nn, hier);

  // 2) Verificar que todos los codigos destino existan
  console.log('\n— Verificación de códigos del mapa —');
  const missing = [];
  const codigoToNode = new Map();
  for (const [subarea, codigo] of Object.entries(subareaToCodigo)) {
    const node = hier.byCodigo.get(codigo);
    if (!node) { missing.push(`${subarea} → ${codigo}`); continue; }
    codigoToNode.set(codigo, node);
  }
  if (missing.length) {
    console.error('❌ Códigos no encontrados en la colección hierarchy real:');
    missing.forEach((m) => console.error('   · ' + m));
    console.error('\nAbortando: la jerarquía canónica pudo no haberse importado completa.');
    console.error('Corre primero data/jerarquia/import_hierarchy_admin.ts o revisa los códigos.');
    process.exit(1);
  }
  console.log(`✅ ${codigoToNode.size}/${Object.keys(subareaToCodigo).length} códigos resueltos`);

  // Mapa normalizado subárea → {codigo, node, pathLegible}
  const normMap = new Map();
  for (const [subarea, codigo] of Object.entries(subareaToCodigo)) {
    const node = codigoToNode.get(codigo);
    normMap.set(normalize(subarea), { codigo, node, pathLegible: readablePath(node, hier.byId) });
  }

  // 3) Recorrer plantAssets y vincular
  console.log('\n— plantAssets —');
  const snap = await db.collection(ASSETS).get();
  let linked = 0, already = 0, noMatch = 0, updated = 0;
  const noMatchSubareas = new Map();

  for (const doc of snap.docs) {
    const d = doc.data();
    const sub = normalize(d.subarea);
    const target = normMap.get(sub);
    if (!target) {
      noMatch++;
      const key = d.subarea || '(vacía)';
      noMatchSubareas.set(key, (noMatchSubareas.get(key) || 0) + 1);
      continue;
    }
    const nodeId = target.node.id;
    const alreadyLinked = d.hierarchyNodeId === nodeId && d.hierarchyPath === target.pathLegible;
    if (alreadyLinked && !isForce) { already++; continue; }

    if (isDryRun) {
      console.log(`  ✓ [DRY] ${doc.id}  [${d.subarea}] → ${target.codigo}  (${target.pathLegible})`);
      linked++; continue;
    }
    await doc.ref.set(
      { hierarchyNodeId: nodeId, hierarchyPath: target.pathLegible, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true },
    );
    if (alreadyLinked) updated++; else linked++;
  }

  console.log('\n' + '-'.repeat(68));
  console.log(`Resumen plantAssets: ${linked} vinculados${isForce ? `, ${updated} reescritos` : ''}, ${already} ya vinculados, ${noMatch} sin match`);
  if (noMatchSubareas.size) {
    console.log('Subáreas sin entrada en el mapa (no vinculadas):');
    [...noMatchSubareas.entries()].forEach(([k, n]) => console.log(`   · ${k}: ${n}`));
  }
  if (isDryRun) console.log('⚠️  DRY-RUN: no se escribió nada. Corre sin --dry-run para aplicar.');
  console.log('-'.repeat(68) + '\n');
  process.exit(0);
}

main().catch((err) => { console.error('\n❌ Error fatal:', err.message); process.exit(1); });
