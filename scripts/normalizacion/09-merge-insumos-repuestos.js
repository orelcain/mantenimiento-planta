#!/usr/bin/env node
/**
 * FASE 6 — Unificar insumos → maestro `repuestos` (un material = un SAP)
 *
 * Modelo congelado con el usuario (2026-06-11): la colección `repuestos` pasa a
 * ser el MAESTRO de materiales (repuesto·insumo·herramienta·químico·lubricante·
 * refrigeración). Se absorbe `insumos` por código SAP:
 *   - SAP que ya existe en repuestos (≈533): MERGE — insumos manda en
 *     texto/SAP/familia/unidad; el repuesto conserva equipos[]/specs/fotos.
 *   - SAP solo en insumos (≈3019): nuevo doc, equipos:[] (transversal).
 *   - Repuestos sin SAP (3880 despiece) y solo-repuestos (226): se quedan.
 * Deriva `clase` (de familia, salvo que tenga equipos → 'repuesto') y `tieneSap`.
 * NO toca `insumos` (se conserva como respaldo; su borrado va en limpieza).
 *
 * Idempotente: docId determinístico (SAP); set reconstruye los mismos campos.
 *
 * Uso:
 *   node scripts/normalizacion/09-merge-insumos-repuestos.js           ← DRY-RUN
 *   node scripts/normalizacion/09-merge-insumos-repuestos.js --write   ← aplica
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
const isSap = (s) => /^\d{6,}$/.test((s || '').trim());

// familia SAP → clase (salvo que tenga equipos → 'repuesto', se aplica aparte)
const deriveClase = (familia, subFamilia) => {
  const f = `${familia || ''} ${subFamilia || ''}`.toUpperCase();
  if (f.includes('REPUESTO')) return 'repuesto';
  if (f.includes('HERRAMIENTA')) return 'herramienta';
  if (f.includes('QUIMICO') || f.includes('QUÍMICO')) return 'quimico';
  if (f.includes('LUBRICANTE')) return 'lubricante';
  if (f.includes('REFRIGERA')) return 'refrigeracion';
  return 'insumo';
};

const firstFilled = (...v) => v.find((x) => x != null && String(x).trim() !== '') ?? '';
const dedup = (a) => [...new Set(a)];

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log(`FASE 6 — UNIFICAR insumos → repuestos ${WRITE ? '⚠ MODO ESCRITURA' : '(dry-run, no escribe)'}`);
  console.log('='.repeat(64));

  const repSnap = await db.collection('repuestos').get();
  const insSnap = await db.collection('insumos').get();
  console.log(`\nrepuestos actuales: ${repSnap.size} | insumos: ${insSnap.size}`);
  console.log('muestra insumo:', JSON.stringify(insSnap.docs[0].data()).slice(0, 220));

  // master: docId → data (parte de los repuestos existentes)
  const master = new Map();
  for (const d of repSnap.docs) master.set(d.id, { ...d.data() });

  // normalizar origen.de en cada existente
  const normDe = (o) => {
    if (!o) return [];
    if (Array.isArray(o.de)) return o.de;
    if (o.tipo) return [o.tipo];
    return [];
  };

  // Pass 1: enriquecer repuestos existentes con clase/tieneSap/origen.de
  for (const [, doc] of master) {
    const equipos = Array.isArray(doc.equipos) ? doc.equipos : [];
    doc.tieneSap = isSap(doc.codigoSAP);
    doc.clase = equipos.length ? 'repuesto' : deriveClase(doc.familia, doc.subFamilia);
    doc.origen = { ...(doc.origen || {}), de: dedup(normDe(doc.origen)) };
  }

  // Pass 2: absorber insumos
  let merges = 0, nuevos = 0;
  for (const d of insSnap.docs) {
    const ins = d.data();
    const sap = (ins.codigoSAP || d.id || '').trim();
    if (!isSap(sap)) continue; // todos deberían tener SAP
    const existing = master.get(sap);
    if (existing) {
      // MERGE (533): insumos manda en texto/SAP/familia/unidad
      existing.textoBreve = firstFilled(ins.textoBreve, existing.textoBreve);
      existing.familia = firstFilled(ins.familia, existing.familia);
      existing.subFamilia = firstFilled(ins.subFamilia, existing.subFamilia);
      existing.unidad = firstFilled(ins.unidadMedida, ins.unidad, existing.unidad);
      existing.tieneSap = true;
      const equipos = Array.isArray(existing.equipos) ? existing.equipos : [];
      existing.clase = equipos.length ? 'repuesto' : deriveClase(existing.familia, existing.subFamilia);
      existing.origen = { ...(existing.origen || {}), de: dedup([...normDe(existing.origen), 'insumo']), insumoId: d.id };
      merges++;
    } else {
      // NUEVO (3019 transversales)
      master.set(sap, {
        codigoSAP: sap,
        tieneSap: true,
        textoBreve: firstFilled(ins.textoBreve),
        descripcion: firstFilled(ins.descripcion),
        codigoFabricante: firstFilled(ins.codigoFabricante),
        familia: firstFilled(ins.familia),
        subFamilia: firstFilled(ins.subFamilia),
        unidad: firstFilled(ins.unidadMedida, ins.unidad),
        clase: deriveClase(ins.familia, ins.subFamilia),
        equipos: [],
        equiposCodigos: [],
        parentMaterialId: null,
        fotosReales: [],
        manualesPropios: [],
        origen: { de: ['insumo'], insumoId: d.id },
      });
      nuevos++;
    }
  }

  // ── stats ──
  const all = [...master.values()];
  const claseDist = {};
  let conSap = 0, sinSap = 0, sinEquipoConSap = 0, repsSinEquipo = 0;
  for (const m of all) {
    claseDist[m.clase] = (claseDist[m.clase] || 0) + 1;
    const eq = (m.equipos || []).length;
    if (m.tieneSap) conSap++; else sinSap++;
    if (m.tieneSap && eq === 0) sinEquipoConSap++;
    if (m.clase === 'repuesto' && m.tieneSap && eq === 0) repsSinEquipo++;
  }
  console.log(`\nFusiones (SAP en ambos): ${merges} | nuevos desde insumos: ${nuevos}`);
  console.log(`Maestro final: ${master.size} docs (antes ${repSnap.size})`);
  console.log(`  con SAP: ${conSap} | sin SAP (despiece): ${sinSap}`);
  console.log(`  con SAP pero SIN equipo: ${sinEquipoConSap} (de esos clase=repuesto → backlog "asignar equipo": ${repsSinEquipo})`);
  console.log('  distribución de clase:', JSON.stringify(claseDist));

  const report = {
    timestamp: new Date().toISOString(), modo: WRITE ? 'write' : 'dry-run',
    totales: { repuestosAntes: repSnap.size, insumos: insSnap.size, merges, nuevos, maestroFinal: master.size, conSap, sinSap, sinEquipoConSap, asignarEquipoBacklog: repsSinEquipo },
    claseDist,
  };
  fs.writeFileSync(path.join(__dirname, '09-merge-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nReporte: ${path.relative(ROOT, path.join(__dirname, '09-merge-report.json'))}`);

  if (!WRITE) {
    console.log('\n✓ DRY-RUN terminado. Ninguna escritura. Revisar y correr con --write.\n');
    process.exit(0);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const entries = [...master.entries()];
  let w = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [docId, m] of entries.slice(i, i + 400)) {
      batch.set(db.collection('repuestos').doc(docId), { ...m, updatedAt: now, createdAt: m.createdAt || now }, { merge: true });
    }
    await batch.commit();
    w += Math.min(400, entries.length - i);
    if (w % 2000 === 0 || w === entries.length) console.log(`  …${w}/${entries.length}`);
  }

  const verify = await db.collection('repuestos').get();
  const sinClase = verify.docs.filter((d) => !d.data().clase).length;
  console.log(`\n✓ Escritura completa: ${w} docs. Colección `.concat('`repuestos`', `: ${verify.size}.`));
  console.log(sinClase === 0 ? '✓ Todos los docs tienen clase.' : `⚠ ${sinClase} sin clase`);
  process.exit(sinClase === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ Error:', e.message); console.error(e.stack); process.exit(1); });
